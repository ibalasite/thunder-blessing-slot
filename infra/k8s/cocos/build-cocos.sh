#!/usr/bin/env bash
# Build Cocos web game image via kaniko and deploy to K8s
# Usage: ./infra/k8s/cocos/build-cocos.sh [IMAGE_TAG]
set -euo pipefail

export PATH="$PATH:$HOME/.rd/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
NAMESPACE="thunder-dev"
REGISTRY_SVC="registry.${NAMESPACE}.svc.cluster.local:5000"
REGISTRY_NODE="localhost:30500"
IMAGE_TAG="${1:-cocos-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'dev')}"

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[cocos-build]${NC} $*"; }

# ── Step 0: Cocos CLI build + patch portrait resolution ───────────────────────
cocos_build() {
  log "[0/3] Building Cocos web-desktop..."
  COCOS_CLI="/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator"
  if [ ! -f "$COCOS_CLI" ]; then
    log "Cocos Creator not found at $COCOS_CLI — skipping build (using existing build/ output)"
    return 0
  fi
  "$COCOS_CLI" \
    --project "$PROJECT_ROOT" \
    --build "platform=web-desktop;debug=false;outputPath=./build" \
    2>&1 | grep -E "(error|Error|complete|failed)" | tail -5

  # Patch index.html: CLI defaults to 1280x960 (landscape), patch to 720x1280 (portrait)
  local HTML="$PROJECT_ROOT/build/web-desktop/index.html"
  sed -i '' \
    -e 's/style="width: 1280px; height: 960px;"/style="width: 720px; height: 1280px;"/g' \
    -e 's/width="1280" height="960"/width="720" height="1280"/g' \
    -e 's/var DW=1280,DH=960/var DW=720,DH=1280/g' \
    "$HTML"
  log "Patched index.html → 720×1280 portrait"
}

cocos_build

# ── Step 1: Upload build context ──────────────────────────────────────────────
log "[1/3] Uploading Cocos build context to PVC..."

kubectl delete pod cocos-context-loader -n "$NAMESPACE" --ignore-not-found --wait=false

kubectl run cocos-context-loader \
  --image=busybox:1.36 --restart=Never --namespace="$NAMESPACE" \
  --overrides='{
    "spec": {
      "volumes": [{"name":"ctx","persistentVolumeClaim":{"claimName":"kaniko-context"}}],
      "containers": [{
        "name": "cocos-context-loader",
        "image": "busybox:1.36",
        "command": ["sh","-c","rm -rf /workspace/* 2>/dev/null; mkdir -p /workspace/web-desktop; echo ready; sleep 3600"],
        "volumeMounts": [{"name":"ctx","mountPath":"/workspace"}]
      }]
    }
  }'

kubectl wait pod/cocos-context-loader -n "$NAMESPACE" --for=condition=Ready --timeout=60s

# Copy nginx Dockerfile and config
kubectl cp "$SCRIPT_DIR/Dockerfile"   "${NAMESPACE}/cocos-context-loader:/workspace/Dockerfile"
kubectl cp "$SCRIPT_DIR/nginx.conf"   "${NAMESPACE}/cocos-context-loader:/workspace/nginx.conf"

# Copy Cocos web-desktop build output
kubectl cp "$PROJECT_ROOT/build/web-desktop/." \
  "${NAMESPACE}/cocos-context-loader:/workspace/web-desktop/" --retries=3

kubectl exec -n "$NAMESPACE" cocos-context-loader -- \
  test -f /workspace/web-desktop/index.html || { echo "ERROR: index.html not found in PVC"; exit 1; }

kubectl delete pod cocos-context-loader -n "$NAMESPACE" --wait=false
log "Context uploaded."

# ── Step 2: Kaniko build ───────────────────────────────────────────────────────
log "[2/3] Running kaniko build (tag: $IMAGE_TAG)..."

JOB_NAME="kaniko-cocos-${IMAGE_TAG}"
kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --ignore-not-found --wait=true

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: kaniko
          image: gcr.io/kaniko-project/executor:v1.23.2
          args:
            - "--context=dir:///workspace"
            - "--dockerfile=/workspace/Dockerfile"
            - "--destination=${REGISTRY_SVC}/thunder-cocos:${IMAGE_TAG}"
            - "--destination=${REGISTRY_SVC}/thunder-cocos:latest"
            - "--insecure"
            - "--skip-tls-verify"
            - "--snapshot-mode=redo"
          volumeMounts:
            - name: build-context
              mountPath: /workspace
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "1000m", memory: "1Gi" }
      volumes:
        - name: build-context
          persistentVolumeClaim:
            claimName: kaniko-context
EOF

kubectl wait "job/$JOB_NAME" -n "$NAMESPACE" --for=condition=complete --timeout=10m || {
  kubectl logs -n "$NAMESPACE" -l "job-name=$JOB_NAME" --tail=30
  echo "ERROR: Kaniko build failed"; exit 1
}
log "Image built: ${REGISTRY_SVC}/thunder-cocos:${IMAGE_TAG}"

# ── Step 3: Deploy ─────────────────────────────────────────────────────────────
log "[3/3] Deploying thunder-cocos..."

# Patch image to use NodePort address for kubelet pull
kubectl apply -f "$SCRIPT_DIR/cocos-deployment.yaml"
kubectl set image deployment/thunder-cocos \
  cocos="${REGISTRY_NODE}/thunder-cocos:${IMAGE_TAG}" \
  -n "$NAMESPACE"
kubectl rollout status deployment/thunder-cocos -n "$NAMESPACE" --timeout=2m

echo ""
log "Deploy complete!"
log "  Game URL: http://localhost:30080"
