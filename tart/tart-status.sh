#!/usr/bin/env bash
# tart-status.sh — Show the status of the Tart VM.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tart-config.sh
source "${SCRIPT_DIR}/tart-config.sh"

require_tart

if ! vm_exists; then
  echo '{"vm":"'"${TART_VM_NAME}"'","exists":false,"running":false,"ip":null}'
  exit 0
fi

RUNNING=false
IP="null"

if vm_running; then
  RUNNING=true
  RAW_IP="$(vm_ip 2>/dev/null || echo "")"
  if [ -n "${RAW_IP}" ]; then
    IP="\"${RAW_IP}\""
  fi
fi

cat <<JSON
{
  "vm": "${TART_VM_NAME}",
  "exists": true,
  "running": ${RUNNING},
  "ip": ${IP},
  "config": {
    "cpus": ${TART_VM_CPUS},
    "memory_mb": ${TART_VM_MEMORY},
    "disk_gb": ${TART_VM_DISK},
    "base_image": "${TART_BASE_IMAGE}",
    "ssh_user": "${TART_SSH_USER}"
  }
}
JSON
