#!/usr/bin/env bash
# Thunder Blessing Slot — K8s Dev Full Stack Deploy Script
# Usage: ./infra/k8s/deploy-dev.sh [from project root]
set -euo pipefail

export PATH="$PATH:$HOME/.rd/bin"
NAMESPACE="thunder-dev"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== [1/5] Waiting for Supabase DB to be ready ==="
kubectl rollout status statefulset/supabase-supabase-db -n "$NAMESPACE" --timeout=5m

DB_POD=$(kubectl get pod -n "$NAMESPACE" -l app=supabase-db -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || \
         kubectl get pod -n "$NAMESPACE" -l "app.kubernetes.io/name=supabase-db" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || \
         kubectl get pod -n "$NAMESPACE" | grep supabase-db | awk '{print $1}')

echo "DB pod: $DB_POD"

echo "=== [2/5] Running SQL migrations ==="
kubectl exec -n "$NAMESPACE" "$DB_POD" -- \
  psql -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1 && echo "DB connection OK"

kubectl exec -n "$NAMESPACE" -i "$DB_POD" -- \
  psql -U postgres -d postgres < "$PROJECT_ROOT/supabase/migrations/20260328000001_initial_schema.sql" \
  && echo "Migration applied" || echo "Migration already applied (skipped)"

echo "=== [3/5] Building thunder-web:dev Docker image ==="
cd "$PROJECT_ROOT"
# Build with nerdctl in k8s.io namespace so K8s can access it directly (no registry needed)
nerdctl build \
  --namespace k8s.io \
  -t thunder-web:dev \
  -f apps/web/Dockerfile \
  .

echo "=== [4/5] Waiting for all Supabase pods to be ready ==="
kubectl wait pod \
  -n "$NAMESPACE" \
  -l "app.kubernetes.io/instance=supabase" \
  --for=condition=Ready \
  --timeout=5m \
  2>/dev/null || true

kubectl get pods -n "$NAMESPACE"

echo "=== [5/5] Deploying thunder-web to K8s ==="
kubectl apply -k "$PROJECT_ROOT/infra/k8s/overlays/dev/"
kubectl rollout status deployment/thunder-web -n "$NAMESPACE" --timeout=3m

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "Access points:"
echo "  Fastify API:     http://localhost:$(kubectl get svc thunder-web -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo '30001')/api/v1/health"
echo "  Supabase Kong:   http://localhost:$(kubectl get svc supabase-supabase-kong -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}')"
echo ""
echo "Run: curl http://localhost:<port>/api/v1/health"
