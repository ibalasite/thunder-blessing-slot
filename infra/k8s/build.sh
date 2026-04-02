#!/usr/bin/env bash
# Thunder Blessing Slot — Kubernetes-Native Build & Deploy
#
# Usage: ./infra/k8s/build.sh [IMAGE_TAG]
#   IMAGE_TAG defaults to current git short SHA
#
# What this does (pure K8s, no local Docker):
#   1. Bootstrap: deploy in-cluster registry (registry:2)
#   2. Configure k3s containerd to trust the insecure in-cluster registry
#   3. Upload source code to a PVC (build context)
#   4. Run kaniko Job inside K8s — builds image, pushes to in-cluster registry
#   5. Update kustomize image reference
#   6. Deploy Fastify API via kubectl apply -k
#
# Cloud parity: swap REGISTRY_SVC for ECR/Artifact Registry URI,
#   remove --insecure/--skip-tls-verify from kaniko Job, add --docker-config.

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
export PATH="$PATH:$HOME/.rd/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$SCRIPT_DIR"
NAMESPACE="thunder-dev"
# Kaniko pushes using cluster-internal DNS (accessible from pods via CoreDNS)
REGISTRY_SVC="registry.${NAMESPACE}.svc.cluster.local:5000"
# Kubelet pulls using NodePort (accessible from the node/Lima VM directly)
REGISTRY_NODE="localhost:30500"
IMAGE_TAG="${1:-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'dev')}"

# ── OS-aware Rancher Desktop shell ────────────────────────────────────────────
# macOS/Linux: rdctl shell → Lima VM
# Windows (Git Bash / MSYS2): wsl -d rancher-desktop → WSL2 distro
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) RDSHELL=(wsl -d rancher-desktop --) ;;
  *)                     RDSHELL=(rdctl shell --) ;;
esac

# Colours
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[build.sh]${NC} $*"; }
warn() { echo -e "${YELLOW}[build.sh]${NC} $*"; }
die()  { echo -e "${RED}[build.sh] ERROR:${NC} $*" >&2; exit 1; }

# ── Portable template rendering (replaces envsubst — not in Git Bash by default)
render_template() {
  sed \
    -e "s|\${IMAGE_TAG}|${IMAGE_TAG}|g" \
    -e "s|\${REGISTRY_SVC}|${REGISTRY_SVC}|g" \
    "$1"
}

# ── Windows-safe local path for kubectl cp ────────────────────────────────────
# Git Bash converts /c/Users/... → C:\Users\... (backslash) before passing to
# kubectl.exe, which then mistakes "C:" for a pod namespace. cygpath -m produces
# C:/Users/... (forward-slash) which kubectl correctly identifies as a local path.
# On Mac/Linux, cygpath is absent and the path is returned unchanged.
_kcp_path() {
  command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || echo "$1"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
preflight() {
  log "Preflight checks..."
  command -v kubectl >/dev/null || die "kubectl not found at ~/.rd/bin/kubectl"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) command -v wsl >/dev/null || die "wsl not found — is WSL2 enabled and Rancher Desktop installed?" ;;
    *) command -v rdctl >/dev/null || die "rdctl not found — is Rancher Desktop running?" ;;
  esac
  kubectl cluster-info >/dev/null 2>&1 || die "K8s cluster not reachable"
  kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || \
    kubectl create namespace "$NAMESPACE"
  log "Cluster OK — namespace: $NAMESPACE | image tag: $IMAGE_TAG"
}

# ── Phase 1: Bootstrap Registry ───────────────────────────────────────────────
bootstrap_registry() {
  log "[1/6] Bootstrapping in-cluster registry..."

  kubectl apply -k "$K8S_DIR/registry/" 2>&1
  kubectl rollout status deployment/registry -n "$NAMESPACE" --timeout=2m

  local REGISTRY_IP
  REGISTRY_IP=$(kubectl get svc registry -n "$NAMESPACE" \
    -o jsonpath='{.spec.clusterIP}')
  log "Registry ClusterIP: $REGISTRY_IP"

  # Check if containerd config already covers localhost:30500.
  # All RDSHELL invocations below use 'sh -c <quoted-cmd>' so that Linux paths
  # like /etc/rancher/k3s/... are embedded inside a shell-string argument, NOT
  # passed as standalone arguments.  Git Bash only converts standalone arguments
  # that start with '/' — paths inside a quoted sh -c string are left untouched.
  if "${RDSHELL[@]}" sh -c \
       'grep -q "localhost:30500" /etc/rancher/k3s/registries.yaml 2>/dev/null'; then
    log "Containerd registry config already up to date."
    return 0
  fi

  log "Configuring k3s containerd to trust localhost:30500 (NodePort registry, one-time)..."

  printf '%s\n' \
    'mirrors:' \
    '  "localhost:30500":' \
    '    endpoint:' \
    '      - "http://localhost:30500"' \
    'configs:' \
    '  "localhost:30500":' \
    '    tls:' \
    '      insecureSkipVerify: true' \
    | "${RDSHELL[@]}" sh -c 'sudo tee /etc/rancher/k3s/registries.yaml > /dev/null'

  "${RDSHELL[@]}" sh -c \
    'sudo mkdir -p /var/lib/rancher/k3s/agent/etc/containerd/certs.d/localhost:30500'

  printf '%s\n' \
    'server = "http://localhost:30500"' \
    '' \
    '[host."http://localhost:30500"]' \
    '  capabilities = ["pull", "resolve"]' \
    '  skip_verify = true' \
    | "${RDSHELL[@]}" sh -c \
        'sudo tee /var/lib/rancher/k3s/agent/etc/containerd/certs.d/localhost:30500/hosts.toml > /dev/null'

  # Reload containerd via SIGHUP
  "${RDSHELL[@]}" sh -c \
    'pkill -HUP k3s-agent 2>/dev/null || pkill -HUP k3s 2>/dev/null || true'
  sleep 3
  log "Containerd registry config applied."
}

# ── Phase 2: Bootstrap Build PVC ─────────────────────────────────────────────
bootstrap_pvc() {
  log "[2/6] Ensuring build context PVC exists..."
  kubectl apply -f "$K8S_DIR/build/context-pvc.yaml"
}

# ── Phase 3: Upload Build Context ─────────────────────────────────────────────
upload_context() {
  log "[3/6] Uploading build context to PVC..."

  # Cleanup any stale context-loader pod
  kubectl delete pod context-loader -n "$NAMESPACE" --ignore-not-found --wait=false

  # Start a helper pod that mounts the PVC
  kubectl run context-loader \
    --image=busybox:1.36 \
    --restart=Never \
    --namespace="$NAMESPACE" \
    --overrides='{
      "spec": {
        "volumes": [{
          "name": "ctx",
          "persistentVolumeClaim": {"claimName": "kaniko-context"}
        }],
        "containers": [{
          "name": "context-loader",
          "image": "busybox:1.36",
          "command": ["sh", "-c", "rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null; echo ready; sleep 3600"],
          "volumeMounts": [{"name": "ctx", "mountPath": "/workspace"}]
        }]
      }
    }' 2>/dev/null || true

  log "Waiting for context-loader pod..."
  kubectl wait pod/context-loader -n "$NAMESPACE" \
    --for=condition=Ready --timeout=60s

  log "Copying source code to PVC (this may take 30-60s)..."
  # tar+exec instead of kubectl cp: shell handles the local path (no kubectl path
  # conversion), kubectl exec -i reads from stdin — works identically on Mac and
  # Windows Git Bash regardless of drive-letter or path format issues.
  (cd "$PROJECT_ROOT" && tar --exclude='./.git' --exclude='./temp' -cf - .) \
    | kubectl exec -i -n "$NAMESPACE" context-loader -- \
        sh -c 'cd /workspace && tar -xf -'

  # Verify key files arrived
  kubectl exec -n "$NAMESPACE" context-loader -- \
    test -f /workspace/apps/web/Dockerfile || \
    die "Build context upload failed — Dockerfile not found in PVC"

  kubectl delete pod context-loader -n "$NAMESPACE" --wait=false
  log "Build context uploaded."
}

# ── Phase 4: Run Kaniko Build ─────────────────────────────────────────────────
run_build() {
  log "[4/6] Running kaniko build (IMAGE_TAG=$IMAGE_TAG)..."

  local JOB_NAME="kaniko-build-${IMAGE_TAG}"

  # Remove any previous job with the same tag
  kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --ignore-not-found --wait=true

  # Render template and apply (render_template replaces envsubst, absent on Windows Git Bash)
  render_template "$K8S_DIR/build/kaniko-job.yaml" | kubectl apply -f -

  log "Waiting for kaniko build to complete (timeout: 15m)..."
  if ! kubectl wait "job/$JOB_NAME" -n "$NAMESPACE" \
    --for=condition=complete --timeout=15m; then
    warn "Build failed. Logs:"
    kubectl logs -n "$NAMESPACE" -l "build-tag=${IMAGE_TAG}" --tail=50 || true
    die "Kaniko build failed — see logs above"
  fi

  log "Build complete: ${REGISTRY_SVC}/thunder-web:${IMAGE_TAG}"
}

# ── Phase 5: Update Image Reference ───────────────────────────────────────────
update_image_ref() {
  log "[5/6] Updating kustomize image reference..."
  cd "$K8S_DIR/overlays/dev"
  # Deployment uses NodePort (localhost:30500) so kubelet can pull without cluster DNS
  kustomize edit set image \
    "thunder-web=${REGISTRY_NODE}/thunder-web:${IMAGE_TAG}"
  cd "$PROJECT_ROOT"
}

# ── Phase 6: Deploy ───────────────────────────────────────────────────────────
deploy() {
  log "[6/6] Deploying thunder-web to K8s..."
  kubectl apply -k "$K8S_DIR/overlays/dev/"
  kubectl rollout status deployment/thunder-web -n "$NAMESPACE" --timeout=3m

  local NODE_PORT
  NODE_PORT=$(kubectl get svc thunder-web -n "$NAMESPACE" \
    -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30001")

  echo ""
  log "=========================================="
  log " Deploy complete!"
  log " Image:  ${REGISTRY_SVC}/thunder-web:${IMAGE_TAG}"
  log " Health: http://localhost:${NODE_PORT}/api/v1/health"
  log "=========================================="
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  preflight
  bootstrap_registry
  bootstrap_pvc
  upload_context
  run_build
  update_image_ref
  deploy
}

main "$@"
