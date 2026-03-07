#!/usr/bin/env bash
# tart-launch.sh — Start the Tart VM and optionally run mobile-dev-agent commands.
#
# Usage:
#   ./tart/tart-launch.sh                              # Boot the VM in background
#   ./tart/tart-launch.sh --gui                        # Boot with macOS GUI window
#   ./tart/tart-launch.sh --ssh                        # Boot + open SSH session
#   ./tart/tart-launch.sh --run doctor                 # Boot + run agent command
#   ./tart/tart-launch.sh --run "device list --json"   # Boot + run with flags
#   ./tart/tart-launch.sh --sync                       # Sync project files first
#   ./tart/tart-launch.sh --sync --run test ...        # Sync + run tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tart-config.sh
source "${SCRIPT_DIR}/tart-config.sh"

require_tart

# ─── Parse arguments ──────────────────────────────────────────────────
MODE="background"  # background | gui | ssh
DO_SYNC=false
AGENT_CMD=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gui)      MODE="gui"; shift ;;
    --ssh)      MODE="ssh"; shift ;;
    --sync)     DO_SYNC=true; shift ;;
    --run)      shift; AGENT_CMD=("$@"); break ;;
    -h|--help)
      cat <<'USAGE'
Usage: tart-launch.sh [OPTIONS]

Options:
  --gui           Open the VM with a macOS GUI window
  --ssh           Boot the VM and open an interactive SSH session
  --sync          Sync the project directory into the VM before running
  --run <cmd>     Run a mobile-dev-agent command inside the VM
  -h, --help      Show this help

Examples:
  tart-launch.sh                              # Boot VM headless
  tart-launch.sh --gui                        # Boot VM with display
  tart-launch.sh --ssh                        # SSH into the VM
  tart-launch.sh --run doctor                 # Run doctor check
  tart-launch.sh --run "test --flow flows/"   # Run tests in VM
  tart-launch.sh --sync --run doctor          # Sync code + run doctor
USAGE
      exit 0
      ;;
    *)
      die "Unknown argument: $1 (use --help for usage)"
      ;;
  esac
done

# ─── Ensure VM exists ─────────────────────────────────────────────────
if ! vm_exists; then
  die "VM '${TART_VM_NAME}' does not exist. Run tart-setup.sh first."
fi

# ─── Boot the VM if not running ───────────────────────────────────────
if vm_running; then
  log "VM '${TART_VM_NAME}' is already running."
else
  log "Booting VM '${TART_VM_NAME}'..."
  if [ "${MODE}" = "gui" ]; then
    tart run "${TART_VM_NAME}" &
  else
    tart run "${TART_VM_NAME}" --no-graphics &
  fi
  TART_PID=$!
  disown "${TART_PID}" 2>/dev/null || true
  sleep 5
fi

# ─── Wait for SSH ─────────────────────────────────────────────────────
wait_for_ssh

# ─── Sync project files if requested ──────────────────────────────────
if [ "${DO_SYNC}" = true ]; then
  log "Syncing project files to VM..."
  # Use rsync over SSH for efficient delta syncs
  local_ip="$(vm_ip)"
  if command -v rsync >/dev/null 2>&1 && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${TART_SSH_PASS}" rsync -az --delete \
      --exclude node_modules --exclude dist --exclude .git \
      -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR" \
      "${TART_PROJECT_ROOT}/" "${TART_SSH_USER}@${local_ip}:${TART_VM_AGENT_DIR}/"
  else
    # Fallback to scp
    ssh_cmd "rm -rf ${TART_VM_AGENT_DIR}"
    scp_to_vm "${TART_PROJECT_ROOT}" "${TART_VM_AGENT_DIR}"
  fi
  log "Rebuilding inside VM..."
  ssh_cmd "cd ${TART_VM_AGENT_DIR} && npm install && npm run build"
  log "Sync complete."
fi

# ─── Execute based on mode ────────────────────────────────────────────
VM_IP="$(vm_ip)"

if [ ${#AGENT_CMD[@]} -gt 0 ]; then
  log "Running: mobile-dev-agent ${AGENT_CMD[*]}"
  ssh_cmd "cd ${TART_VM_AGENT_DIR} && node dist/src/bin/mobile-dev-agent.js ${AGENT_CMD[*]}"
elif [ "${MODE}" = "ssh" ]; then
  log "Opening SSH session to VM (${VM_IP})..."
  log "mobile-dev-agent is at: ${TART_VM_AGENT_DIR}"
  log "To run commands: node dist/src/bin/mobile-dev-agent.js <command>"
  log ""
  ssh_cmd
elif [ "${MODE}" = "gui" ]; then
  log "VM is running with GUI. SSH available at: ${TART_SSH_USER}@${VM_IP}"
  log "Use: ssh ${TART_SSH_USER}@${VM_IP}"
else
  log "VM is running headless. SSH available at: ${TART_SSH_USER}@${VM_IP}"
  log ""
  log "Quick commands:"
  log "  ./tart/tart-launch.sh --ssh                    # Open SSH session"
  log "  ./tart/tart-launch.sh --run doctor             # Run doctor"
  log "  ./tart/tart-launch.sh --run 'device list'      # List devices"
  log "  ./tart/tart-stop.sh                            # Stop the VM"
fi
