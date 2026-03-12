#!/usr/bin/env bash
# Deploy this integration straight into Home Assistant (no HACS).
# Builds the frontend, then copies custom_components/esphome_touch_designer to the HA host.
#
# Prerequisites:
#   - Frontend deps: cd frontend && npm install
#   - HA host reachable via SSH (e.g. SSH add-on or direct access to /config)
#
# Usage:
#   HA_HOST=homeassistant.local ./scripts/deploy_to_ha.sh
#   HA_HOST=192.168.1.10 HA_SSH_USER=root ./scripts/deploy_to_ha.sh
#
# Optional env:
#   HA_HOST          - Hostname or IP of the HA host (required)
#   HA_SSH_USER      - SSH user (default: root)
#   HA_CONFIG_PATH   - Path to config on the host (default: /config)
#   SKIP_BUILD       - Set to 1 to skip 'npm run build' (use if already built)
#   RSYNC_OPTS       - Extra options for rsync (e.g. --delete to remove stale files)
#
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HA_HOST="${HA_HOST:-}"
HA_SSH_USER="${HA_SSH_USER:-root}"
HA_CONFIG_PATH="${HA_CONFIG_PATH:-/config}"
SKIP_BUILD="${SKIP_BUILD:-0}"
REMOTE_DIR="${HA_CONFIG_PATH}/custom_components/esphome_touch_designer"
SRC_DIR="${ROOT}/custom_components/esphome_touch_designer"

if [ -z "$HA_HOST" ]; then
  echo "Set HA_HOST (e.g. HA_HOST=homeassistant.local or HA_HOST=192.168.1.10)"
  echo "Then run: ./scripts/deploy_to_ha.sh"
  exit 1
fi

if [ "$SKIP_BUILD" != "1" ]; then
  echo "Building frontend..."
  (cd frontend && npm run build)
fi

if [ ! -d "${SRC_DIR}/web/dist" ] || [ ! -f "${SRC_DIR}/web/dist/index.html" ]; then
  echo "Missing frontend build at ${SRC_DIR}/web/dist. Run: cd frontend && npm run build"
  exit 1
fi

echo "Deploying to ${HA_SSH_USER}@${HA_HOST}:${REMOTE_DIR}"
mkdir -p "${SRC_DIR}"
rsync ${RSYNC_OPTS:-} -avz --exclude='__pycache__' --exclude='*.pyc' \
  "${SRC_DIR}/" "${HA_SSH_USER}@${HA_HOST}:${REMOTE_DIR}/"

echo "Done. Restart Home Assistant or reload the integration (Developer Tools → YAML → Reload: ESPHome Touch Designer)."
