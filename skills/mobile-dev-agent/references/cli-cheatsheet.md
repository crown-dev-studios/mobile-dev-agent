# Mobile Dev Agent CLI Cheatsheet

Use from repo root after build:
- npm install
- npm run build
- node dist/src/bin/mobile-dev-agent.js <command> ...

Common commands

- doctor
  - node dist/src/bin/mobile-dev-agent.js doctor --json

- list devices
  - node dist/src/bin/mobile-dev-agent.js device list --platform ios
  - node dist/src/bin/mobile-dev-agent.js device list --platform android

- boot device
  - node dist/src/bin/mobile-dev-agent.js device boot --platform ios --device "iphone-latest"

- build iOS app (simulator)
  - node dist/src/bin/mobile-dev-agent.js app build-ios --project path/to/App.xcodeproj --scheme App

- install app
  - node dist/src/bin/mobile-dev-agent.js app install --platform ios --app /path/to/App.app --device "iphone-latest" --boot

- run Maestro flows (dir or file)
  - node dist/src/bin/mobile-dev-agent.js test --platform ios --flow maestro/flows --device "iphone-latest" --boot --json
  - node dist/src/bin/mobile-dev-agent.js test --platform ios --flow flows/login.yaml --format junit --output /tmp/maestro-report.xml

- run ad-hoc flow from stdin
  - node dist/src/bin/mobile-dev-agent.js flow run --platform ios --device "iphone-latest" --app-id com.example.app <<'YAML'
    - launchApp
    - tapOn: "Sign in"
    - assertVisible: "Welcome"
    YAML

- screenshot
  - node dist/src/bin/mobile-dev-agent.js device screenshot --platform ios --device booted --out /tmp/sim.png
