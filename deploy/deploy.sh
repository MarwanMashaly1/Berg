#!/usr/bin/env bash
# deploy.sh — Rebuild and restart Berg API on the Oracle VM
# Run from repo root: bash deploy/deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_DIR/packages/api"

echo "→ Pulling latest code..."
git -C "$REPO_DIR" pull --ff-only

echo "→ Building Docker image..."
docker compose -f "$API_DIR/docker-compose.yml" build --no-cache

echo "→ Restarting service..."
docker compose -f "$API_DIR/docker-compose.yml" up -d

echo "→ Waiting for health check..."
sleep 5
STATUS=$(curl -sf http://localhost:3000/health && echo "ok" || echo "fail")

if [[ "$STATUS" == "ok" ]]; then
  echo "✓ Deploy complete — API is healthy"
else
  echo "✗ Health check failed — checking logs:"
  docker compose -f "$API_DIR/docker-compose.yml" logs --tail=50
  exit 1
fi
