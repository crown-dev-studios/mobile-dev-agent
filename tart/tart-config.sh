#!/usr/bin/env bash
# tart-config.sh — Shared configuration for Tart VM management
# All scripts source this file for consistent defaults.

set -euo pipefail

# ─── VM identity ───────────────────────────────────────────────────────
TART_VM_NAME="${TART_VM_NAME:-mobile-dev-agent}"
TART_BASE_IMAGE="${TART_BASE_IMAGE:-ghcr.io/cirruslabs/macos-sequoia-xcode:latest}"

# ─── VM resources ──────────────────────────────────────────────────────
TART_VM_CPUS="${TART_VM_CPUS:-4}"
TART_VM_MEMORY="${TART_VM_MEMORY:-8192}"       # MB
TART_VM_DISK="${TART_VM_DISK:-80}"             # GB

# ─── Networking ────────────────────────────────────────────────────────
TART_SSH_PORT="${TART_SSH_PORT:-2222}"
TART_SSH_USER="${TART_SSH_USER:-admin}"
TART_SSH_PASS="${TART_SSH_PASS:-admin}"

# ─── Paths inside the VM ──────────────────────────────────────────────
TART_VM_WORKSPACE="/Users/${TART_SSH_USER}/workspace"
TART_VM_AGENT_DIR="${TART_VM_WORKSPACE}/mobile-dev-agent"

# ─── Host paths ────────────────────────────────────────────────────────
TART_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TART_PROJECT_ROOT="$(cd "${TART_SCRIPTS_DIR}/.." && pwd)"

# ─── Timeouts ──────────────────────────────────────────────────────────
TART_BOOT_TIMEOUT="${TART_BOOT_TIMEOUT:-300}"   # seconds to wait for VM boot
TART_SSH_TIMEOUT="${TART_SSH_TIMEOUT:-120}"      # seconds to wait for SSH

# ─── Helpers ───────────────────────────────────────────────────────────
log() { printf '[tart] %s\n' "$*" >&2; }
die() { printf '[tart] ERROR: %s\n' "$*" >&2; exit 1; }

require_tart() {
  command -v tart >/dev/null 2>&1 || die "tart is not installed. Install via: brew install cirruslabs/cli/tart"
}

vm_exists() {
  tart list 2>/dev/null | grep -q "^${TART_VM_NAME}[[:space:]]" 2>/dev/null
}

vm_running() {
  tart list 2>/dev/null | grep "^${TART_VM_NAME}[[:space:]]" | grep -q "running" 2>/dev/null
}

vm_ip() {
  tart ip "${TART_VM_NAME}" 2>/dev/null
}

ssh_cmd() {
  local ip
  ip="$(vm_ip)" || die "Cannot resolve VM IP. Is the VM running?"
  # Use sshpass for password-based auth (common for Tart VMs)
  if command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${TART_SSH_PASS}" ssh \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      "${TART_SSH_USER}@${ip}" "$@"
  else
    ssh \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      "${TART_SSH_USER}@${ip}" "$@"
  fi
}

scp_to_vm() {
  local src="$1" dest="$2"
  local ip
  ip="$(vm_ip)" || die "Cannot resolve VM IP. Is the VM running?"
  if command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${TART_SSH_PASS}" scp \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      -r "${src}" "${TART_SSH_USER}@${ip}:${dest}"
  else
    scp \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      -r "${src}" "${TART_SSH_USER}@${ip}:${dest}"
  fi
}

wait_for_ssh() {
  log "Waiting for SSH to become available (timeout: ${TART_SSH_TIMEOUT}s)..."
  local elapsed=0
  while [ $elapsed -lt "${TART_SSH_TIMEOUT}" ]; do
    if ssh_cmd "echo ok" >/dev/null 2>&1; then
      log "SSH is ready."
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  die "SSH did not become available within ${TART_SSH_TIMEOUT}s"
}
