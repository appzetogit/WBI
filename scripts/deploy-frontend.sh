#!/usr/bin/env bash
# Production frontend deploy for AWS EC2 (Ubuntu + Nginx)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/Frontend"
WEB_ROOT="${WEB_ROOT:-/var/www/html}"
NODE_MIN_MAJOR=18

echo "=== WBI Frontend Deployment ==="
echo "Root: ${ROOT_DIR}"
echo "Frontend: ${FRONTEND_DIR}"
echo "Web root: ${WEB_ROOT}"

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < NODE_MIN_MAJOR )); then
  echo "ERROR: Node.js >= ${NODE_MIN_MAJOR} required. Current: $(node -v)"
  exit 1
fi

echo "Node: $(node -v) | npm: $(npm -v)"

cd "${FRONTEND_DIR}"

if [[ ! -f package.json ]]; then
  echo "ERROR: Frontend/package.json not found"
  exit 1
fi

if ! node -e "const pkg=require('./package.json'); process.exit(pkg.dependencies?.sonner ? 0 : 1)"; then
  echo "ERROR: sonner missing from package.json. Run: git pull origin main"
  exit 1
fi

echo "Cleaning npm cache..."
npm cache clean --force

echo "Removing old node_modules..."
rm -rf node_modules

echo "Installing dependencies from lockfile..."
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "Verifying sonner..."
npm ls sonner --depth=0

echo "Building production bundle..."
npm run build

if [[ ! -d dist ]] || [[ -z "$(ls -A dist 2>/dev/null)" ]]; then
  echo "ERROR: dist folder missing or empty after build"
  exit 1
fi

echo "Deploying to ${WEB_ROOT}..."
sudo mkdir -p "${WEB_ROOT}"
sudo rm -rf "${WEB_ROOT:?}/"*
sudo cp -r dist/* "${WEB_ROOT}/"
sudo chown -R www-data:www-data "${WEB_ROOT}"
sudo find "${WEB_ROOT}" -type d -exec chmod 755 {} \;
sudo find "${WEB_ROOT}" -type f -exec chmod 644 {} \;

echo "Reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "=== Frontend deployment successful ==="
echo "Files deployed: $(find "${WEB_ROOT}" -type f | wc -l)"
