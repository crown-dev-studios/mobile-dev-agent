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
