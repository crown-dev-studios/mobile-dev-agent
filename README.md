# Mobile Dev Agent CLI (iOS/Android + Maestro)

This repo includes a small Node-based CLI wrapper to make Maestro + iOS/Android automation easier to drive from agent workflows.

It shells out to:

- `maestro` (Maestro CLI)
- `xcrun simctl` (iOS Simulator management)
- `xcodebuild` (build an iOS app for the Simulator)
- `adb` / `emulator` (Android device + emulator management)

It does **not** synthesize host mouse/keyboard events.

## Prerequisites (macOS)

1. Install Maestro:
   - `curl -Ls "https://get.maestro.mobile.dev" | bash`
   - Ensure `~/.maestro/bin` is on your `PATH`
2. Install Java (recommended: Java 17)
3. Install Xcode + iOS Simulator runtimes (via Xcode Settings)

Maestro runs against **simulators/emulators** (not physical devices) in this workflow.

## Quick Start

From the repo root:

```bash
# Build the CLI
cd mobile-dev-agent && npm install && npm run build

# Verify dependencies
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js doctor

# List iOS Simulators + Android devices
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js devices list --platform all

# Build any iOS app (example using an .xcodeproj)
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js build-ios --project path/to/App.xcodeproj --scheme App

# Boot a simulator by name (optional)
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js device boot --name "iPhone 17 Pro"

# Install the built .app to the simulator (optional; `test --app` can do this too)
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js app install --app /path/to/App.app --name "iPhone 17 Pro" --boot

# Run a Maestro flow (YAML) and emit a junit report
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js test --flow maestro/flows --name "iPhone 17 Pro" --boot \
  --format junit --output /tmp/maestro-report.xml --maestro-output-dir /tmp/maestro-out

# Run a temporary flow from stdin (agent-friendly)
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js flow run --platform ios --name "iPhone 17 Pro" --app-id com.example.app <<'YAML'
- launchApp
- tapOn: "Sign in"
- assertVisible: "Welcome"
YAML
```

## JSON Output (for agents)

Every command supports `--json` for machine-readable output:

```bash
node mobile-dev-agent/dist/src/bin/mobile-dev-agent.js test --flow flows/login.yaml --boot --json
```

## Testing

```bash
cd mobile-dev-agent
npm run build
node --test dist/test/*.test.js
```
