#!/usr/bin/env bash
# Thunder Blessing Slot — Full K8s Dev Stack Bootstrap
#
# Usage: ./infra/k8s/start-dev.sh
#
# Starts the complete dev stack from scratch:
#   1. Create namespace
#   2. Install Supabase via Helm (PostgreSQL + Auth + REST + Kong)
#   3. Run DB migrations
#   4. Build & deploy Fastify API (kaniko)
#   5. Build & deploy Cocos nginx pod (kaniko)
#
# Prerequisites:
#   - kubectl + kustomize (from Rancher Desktop ~/.rd/bin)
#   - helm  (brew install helm  /  choco install kubernetes-helm)
#   - Rancher Desktop running with Kubernetes enabled

set -euo pipefail

export PATH="$PATH:$HOME/.rd/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NAMESPACE="thunder-dev"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[start-dev]${NC} $*"; }
warn() { echo -e "${YELLOW}[start-dev]${NC} $*"; }
die()  { echo -e "${RED}[start-dev] ERROR:${NC} $*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
log "Checking prerequisites..."
command -v kubectl >/dev/null || die "kubectl not found — is Rancher Desktop running?"
command -v helm    >/dev/null || die "helm not found — install: brew install helm (Mac) / choco install kubernetes-helm (Windows)"
kubectl cluster-info >/dev/null 2>&1 || die "K8s cluster not reachable — start Rancher Desktop first"
log "Prerequisites OK"

# ── Step 1: Namespace ─────────────────────────────────────────────────────────
log "[1/5] Creating namespace: $NAMESPACE"
kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

# ── Step 2: Supabase via Helm ─────────────────────────────────────────────────
log "[2/5] Installing Supabase..."
helm repo add supabase https://supabase-community.github.io/helm-charts 2>/dev/null || true
helm repo update supabase

helm upgrade --install supabase supabase/supabase \
  --namespace "$NAMESPACE" \
  --values "$SCRIPT_DIR/supabase/values-dev.yaml" \
  --timeout 10m \
  --wait

log "Waiting for Supabase DB to be ready..."
# Discover StatefulSet name dynamically — chart versions differ in naming convention
# (e.g. older: "supabase-supabase-db", newer charts may use a different prefix)
DB_STS=$(kubectl get statefulset -n "$NAMESPACE" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [ -n "$DB_STS" ]; then
  kubectl rollout status "statefulset/$DB_STS" -n "$NAMESPACE" --timeout=5m || \
    warn "DB rollout timed out — pods may still be initializing, continuing anyway"
else
  warn "No StatefulSet found in $NAMESPACE yet — skipping DB readiness check"
fi

# Patch Kong service to fixed NodePort 30000 — Helm chart template does not support
# nodePort in values.yaml so K8s assigns a random port without this patch.
kubectl patch svc supabase-supabase-kong -n "$NAMESPACE" --type='json' \
  -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":30000}]' 2>/dev/null || true
log "Kong NodePort patched → 30000"

# ── Step 3: DB Migrations ─────────────────────────────────────────────────────
log "[3/5] Running DB migrations..."

# Build ConfigMap from every *.sql file in supabase/migrations/ (sorted = ordered execution)
MIGRATION_DIR="$PROJECT_ROOT/supabase/migrations"
FROM_FILE_ARGS=""
for sql in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  base="$(basename "$sql")"
  FROM_FILE_ARGS="$FROM_FILE_ARGS --from-file=${base}=${sql}"
done

if [ -z "$FROM_FILE_ARGS" ]; then
  warn "No SQL migration files found in $MIGRATION_DIR — skipping migration job"
else
  # Create the SQL ConfigMap FIRST so the Job pod sees the files immediately on mount.
  # migration-job.yaml does NOT define supabase-sql-migrations (removed to prevent reset).
  # shellcheck disable=SC2086
  kubectl create configmap supabase-sql-migrations $FROM_FILE_ARGS \
    -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

  # Delete stale job if exists, then apply job YAML (only creates run.sh ConfigMap + Job).
  kubectl delete job supabase-migrate -n "$NAMESPACE" --ignore-not-found --wait=true
  kubectl apply -f "$SCRIPT_DIR/supabase/migration-job.yaml" 2>/dev/null

  # Wait for migration job to complete
  kubectl wait job/supabase-migrate -n "$NAMESPACE" \
    --for=condition=complete --timeout=5m 2>/dev/null || \
    warn "Migration job did not complete in time — check: kubectl logs job/supabase-migrate -n $NAMESPACE"
fi

# ── Step 4: Build & Deploy Fastify API ───────────────────────────────────────
log "[4/5] Building & deploying Fastify API..."
"$SCRIPT_DIR/build.sh"

# ── Step 5: Build & Deploy Cocos Pod ─────────────────────────────────────────
log "[5/5] Building & deploying Cocos nginx pod..."
"$SCRIPT_DIR/cocos/build-cocos.sh"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
log "=========================================="
log " Full dev stack is up!"
log ""
log "  Game (Cocos):   http://localhost:30080"
log "  Fastify API:    http://localhost:30001/api/v1/health"
log "  Supabase Kong:  http://localhost:30000"
log ""
log " Verify all pods:"
log "   kubectl get pods -n $NAMESPACE"
log "=========================================="
