#!/usr/bin/env bash
# tart-stop.sh — Stop the Tart VM.
#
# Usage:
#   ./tart/tart-stop.sh              # Stop the VM
#   ./tart/tart-stop.sh --delete     # Stop and delete the VM entirely

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tart-config.sh
source "${SCRIPT_DIR}/tart-config.sh"

require_tart

DELETE=false
if [[ "${1:-}" == "--delete" ]]; then
  DELETE=true
fi

if ! vm_exists; then
  log "VM '${TART_VM_NAME}' does not exist."
  exit 0
fi

if vm_running; then
  log "Stopping VM '${TART_VM_NAME}'..."
  tart stop "${TART_VM_NAME}"
  log "VM stopped."
else
  log "VM '${TART_VM_NAME}' is not running."
fi

if [ "${DELETE}" = true ]; then
  log "Deleting VM '${TART_VM_NAME}'..."
  tart delete "${TART_VM_NAME}"
  log "VM deleted."
fi
