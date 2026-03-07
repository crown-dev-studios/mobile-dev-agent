#!/usr/bin/env bash
# tart-setup.sh — Create and provision a Tart macOS VM for iOS testing.
#
# Usage:
#   ./tart/tart-setup.sh                        # Use defaults
#   TART_BASE_IMAGE=ghcr.io/cirruslabs/macos-sequoia-xcode:16.2 ./tart/tart-setup.sh
#   TART_VM_NAME=my-ios-lab ./tart/tart-setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tart-config.sh
source "${SCRIPT_DIR}/tart-config.sh"

require_tart

# ─── 1. Clone the base image ──────────────────────────────────────────
if vm_exists; then
  log "VM '${TART_VM_NAME}' already exists."
  read -r -p "[tart] Recreate it? This will DELETE the existing VM. [y/N] " answer
  case "${answer}" in
    [yY]*)
      log "Deleting existing VM '${TART_VM_NAME}'..."
      tart stop "${TART_VM_NAME}" 2>/dev/null || true
      tart delete "${TART_VM_NAME}"
      ;;
    *)
      log "Keeping existing VM. Run tart-launch.sh to start it."
      exit 0
      ;;
  esac
fi

log "Cloning base image '${TART_BASE_IMAGE}' → '${TART_VM_NAME}'..."
log "This may take a while on first run (downloading ~20-30 GB)."
tart clone "${TART_BASE_IMAGE}" "${TART_VM_NAME}"

# ─── 2. Configure VM resources ────────────────────────────────────────
log "Configuring VM: ${TART_VM_CPUS} CPUs, ${TART_VM_MEMORY} MB RAM, ${TART_VM_DISK} GB disk"
tart set "${TART_VM_NAME}" --cpu "${TART_VM_CPUS}" --memory "${TART_VM_MEMORY}" --disk-size "${TART_VM_DISK}"

# ─── 3. Boot the VM ───────────────────────────────────────────────────
log "Booting VM '${TART_VM_NAME}' for provisioning..."
tart run "${TART_VM_NAME}" --no-graphics &
TART_PID=$!

# Give the VM a moment to start
sleep 10

# ─── 4. Wait for SSH ──────────────────────────────────────────────────
wait_for_ssh

# ─── 5. Copy and run the provisioning script ──────────────────────────
log "Copying provisioning script to VM..."
ssh_cmd "mkdir -p ~/workspace"
scp_to_vm "${SCRIPT_DIR}/provision.sh" "~/workspace/provision.sh"

log "Running provisioning inside VM..."
ssh_cmd "chmod +x ~/workspace/provision.sh && ~/workspace/provision.sh"

# ─── 6. Install mobile-dev-agent in the VM ────────────────────────────
log "Syncing mobile-dev-agent to VM..."
scp_to_vm "${TART_PROJECT_ROOT}" "${TART_VM_AGENT_DIR}"

log "Installing mobile-dev-agent inside VM..."
ssh_cmd "cd ${TART_VM_AGENT_DIR} && npm install && npm run build"

# Verify the installation
log "Verifying installation..."
ssh_cmd "cd ${TART_VM_AGENT_DIR} && node dist/src/bin/mobile-dev-agent.js doctor" || true

# ─── 7. Stop the VM (it's provisioned; tart-launch.sh will start it) ─
log "Provisioning complete. Stopping VM..."
tart stop "${TART_VM_NAME}" 2>/dev/null || true
wait "${TART_PID}" 2>/dev/null || true

log "Setup complete! VM '${TART_VM_NAME}' is ready."
log ""
log "Next steps:"
log "  ./tart/tart-launch.sh                    # Start the VM"
log "  ./tart/tart-launch.sh --ssh              # Start + open SSH session"
log "  ./tart/tart-launch.sh --run doctor       # Start + run a command"
log ""
