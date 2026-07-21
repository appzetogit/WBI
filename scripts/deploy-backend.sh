#!/usr/bin/env bash
# Production backend deploy for AWS EC2 (Node + PM2)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/Backend"

echo "=== WBI Backend Deployment ==="
cd "${BACKEND_DIR}"

if [[ ! -f .env ]]; then
  echo "WARNING: Backend/.env not found. Ensure MONGODB_URI and other env vars are set."
fi

echo "Node: $(node -v) | npm: $(npm -v)"

rm -rf node_modules
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

echo "Verifying critical dependencies..."
npm run check:deps

echo "Verifying route modules..."
npm run verify:routes

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe wbi-backend >/dev/null 2>&1; then
    pm2 restart ecosystem.config.js --env production
  else
    pm2 start ecosystem.config.js --env production
  fi
  pm2 save
  pm2 status
else
  echo "ERROR: pm2 not installed"
  exit 1
fi

echo "=== Backend deployment successful ==="
