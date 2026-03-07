#!/usr/bin/env bash
# provision.sh — Runs INSIDE the Tart VM to install all dependencies.
# Called by tart-setup.sh after the VM is booted and SSH is available.

set -euo pipefail

log() { printf '[provision] %s\n' "$*"; }

log "Starting provisioning..."

# ─── 1. Install Homebrew if missing ────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  log "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ─── 2. Install Node.js ───────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js..."
  brew install node@22
  brew link --overwrite node@22
fi
log "Node: $(node --version)"

# ─── 3. Install Java (for Maestro) ────────────────────────────────────
if ! command -v java >/dev/null 2>&1; then
  log "Installing Java 17..."
  brew install openjdk@17
  sudo ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" \
    /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
fi
log "Java: $(java -version 2>&1 | head -1)"

# ─── 4. Install Maestro ───────────────────────────────────────────────
if ! command -v maestro >/dev/null 2>&1; then
  log "Installing Maestro..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  # Add to PATH for current and future sessions
  echo 'export PATH="$HOME/.maestro/bin:$PATH"' >> ~/.zprofile
  export PATH="$HOME/.maestro/bin:$PATH"
fi
log "Maestro: $(maestro --version 2>/dev/null || echo 'installed')"

# ─── 5. Ensure Xcode CLI tools ────────────────────────────────────────
if command -v xcodebuild >/dev/null 2>&1; then
  log "Xcode: $(xcodebuild -version | head -1)"
else
  log "WARNING: Xcode not found. The base image should include Xcode."
  log "If missing, install Xcode from the App Store or use an image that includes it."
fi

# ─── 6. Accept Xcode license (if needed) ──────────────────────────────
if command -v xcodebuild >/dev/null 2>&1; then
  sudo xcodebuild -license accept 2>/dev/null || true
fi

# ─── 7. Boot an iOS Simulator to warm up ──────────────────────────────
log "Listing available iOS Simulator runtimes..."
xcrun simctl list runtimes 2>/dev/null || log "WARNING: simctl not available"

# ─── 8. Install sshpass on the VM for convenience ─────────────────────
brew install hudochenkov/sshpass/sshpass 2>/dev/null || true

# ─── 9. Create workspace directory ────────────────────────────────────
mkdir -p ~/workspace

log "Provisioning complete."
