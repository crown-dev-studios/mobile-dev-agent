# Mobile Dev Agent CLI (iOS/Android + Maestro)

This repo includes a small Node-based CLI wrapper to make Maestro + iOS/Android automation easier to drive from agent workflows.

It shells out to:

- `maestro` (Maestro CLI)
- `xcrun simctl` (iOS Simulator management)
- `xcodebuild` (build an iOS app for the Simulator)
- `axe` (iOS accessibility tree snapshot/actions; see `doctor`)
- `adb` / `emulator` (Android device + emulator management)

It does **not** synthesize host mouse/keyboard events.

## Prerequisites (macOS)

1. Install Maestro:
   - `curl -Ls "https://get.maestro.mobile.dev" | bash`
   - Ensure `~/.maestro/bin` is on your `PATH`
2. Install Java (recommended: Java 17)
3. Install Xcode + iOS Simulator runtimes (via Xcode Settings)
4. Install AXe CLI (or set `MOBILE_DEV_AGENT_AXE_PATH`)
5. Install Android Platform Tools + Emulator (if using Android)

Maestro runs against **simulators/emulators** (not physical devices) in this workflow.

## Install (npm)

```bash
npm i -g mobile-dev-agent
mobile-dev-agent doctor
```

## Quick Start

From the repo root:

```bash
# Build the CLI
npm install && npm run build

# Verify dependencies
node dist/src/bin/mobile-dev-agent.js doctor

# List iOS Simulators + Android devices
node dist/src/bin/mobile-dev-agent.js device list --platform all

# Build any iOS app (example using an .xcodeproj)
node dist/src/bin/mobile-dev-agent.js app build-ios --project path/to/App.xcodeproj --scheme App

# Boot a simulator by selector (optional)
node dist/src/bin/mobile-dev-agent.js device boot --platform ios --device "iphone-latest"

# Install the built .app to the simulator (optional; `test --app` can do this too)
node dist/src/bin/mobile-dev-agent.js app install --platform ios --app /path/to/App.app --device "iphone-latest" --boot

# Run a Maestro flow (YAML) and emit a junit report
node dist/src/bin/mobile-dev-agent.js test --platform ios --flow maestro/flows --device "iphone-latest" --boot \
  --format junit --output /tmp/maestro-report.xml --maestro-output-dir /tmp/maestro-out

# Run a temporary flow from stdin (agent-friendly)
node dist/src/bin/mobile-dev-agent.js flow run --platform ios --device "iphone-latest" --app-id com.example.app <<'YAML'
- launchApp
- tapOn: "Sign in"
- assertVisible: "Welcome"
YAML
```

## Containerized iOS Testing (Tart VM)

Run iOS tests in an **isolated macOS virtual machine** using [Tart](https://tart.run) so you don't affect your desktop environment. The VM comes pre-provisioned with Xcode, iOS Simulators, Maestro, and all dependencies.

### Prerequisites

- **Apple Silicon Mac** (M1/M2/M3/M4) — Tart uses Apple's Virtualization.framework
- Install Tart: `brew install cirruslabs/cli/tart`
- Install sshpass (optional, for password-based SSH): `brew install hudochenkov/sshpass/sshpass`

### Quick Start (Tart VM)

```bash
# 1. Set up the VM (downloads base image, provisions dependencies)
mobile-dev-agent tart setup

# 2. Start the VM (headless)
mobile-dev-agent tart start

# 3. Run commands inside the VM
mobile-dev-agent tart run doctor
mobile-dev-agent tart run device list --platform ios
mobile-dev-agent tart run test --flow flows/ --boot

# 4. SSH into the VM for interactive use
mobile-dev-agent tart start --ssh

# 5. Stop the VM when done
mobile-dev-agent tart stop
```

### Using the Shell Scripts Directly

The `tart/` directory contains standalone shell scripts if you prefer not to use the CLI wrapper:

```bash
# Setup (first time only)
./tart/tart-setup.sh

# Launch
./tart/tart-launch.sh                          # Headless
./tart/tart-launch.sh --gui                     # With macOS GUI window
./tart/tart-launch.sh --ssh                     # Interactive SSH session
./tart/tart-launch.sh --run doctor              # Run a command
./tart/tart-launch.sh --sync --run "test ..."   # Sync code + run

# Status
./tart/tart-status.sh

# Stop
./tart/tart-stop.sh
./tart/tart-stop.sh --delete                    # Stop + delete VM
```

### VM Configuration

All settings can be overridden via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TART_VM_NAME` | `mobile-dev-agent` | VM name |
| `TART_BASE_IMAGE` | `ghcr.io/cirruslabs/macos-sequoia-xcode:latest` | Base image to clone |
| `TART_VM_CPUS` | `4` | CPU cores |
| `TART_VM_MEMORY` | `8192` | Memory in MB |
| `TART_VM_DISK` | `80` | Disk in GB |
| `TART_SSH_USER` | `admin` | SSH username |
| `TART_SSH_PASS` | `admin` | SSH password |
| `TART_BOOT_TIMEOUT` | `300` | Seconds to wait for VM boot |
| `TART_SSH_TIMEOUT` | `120` | Seconds to wait for SSH |

Or pass them as CLI flags: `--vm-name`, `--cpus`, `--memory`, `--disk`, `--base-image`, etc.

## JSON Output (for agents)

Every command supports `--json` for machine-readable output:

```bash
node dist/src/bin/mobile-dev-agent.js test --flow flows/login.yaml --boot --json
```

## Testing

```bash
npm run build
node --test dist/test/*.test.js
```
