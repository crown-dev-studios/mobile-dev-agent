# mobile-dev-agent — CLI Help Canon (Migration Instruction Set)

Version: 1.0 (planning draft)  
Last updated: 2026-02-04

This document defines the **exact intended `--help` outputs** for the migrated CLI.

Conventions used in all help blocks:

- Commands are shown as `mobile-dev-agent …`
- Defaults are explicit.
- Every help block includes: Summary, Usage, Options, Examples, Exit codes.

Global exit codes (all commands):

- `0` success
- `1` command failed
- `2` usage error
- `127` missing dependency

---

## `mobile-dev-agent --help`

```
mobile-dev-agent - Agent-native native mobile automation (iOS Simulator + Android)

Usage:
  mobile-dev-agent [global options] <command> [<args>]

Commands:
  doctor                 Check toolchain dependencies
  session                Manage per-session defaults (platform/device/app/env)
  device                 Manage simulators/devices and capture screenshots
  app                    Build/install/launch/terminate apps
  ui                     Snapshot native UI and interact using refs (@eN)
  flow                   Run ad-hoc Maestro steps (stdin or file)
  test                   Run Maestro flows (file/dir) with reports
  gc                     Clean cache and old run artifacts
  logs                   View logs (Live mode for --follow)
  repl                   Interactive mode (starts Live mode)
  live                   Manage Live mode (optional)

Aliases (deprecated):
  devices list            Alias for: device list
  build-ios               Alias for: app build-ios
  studio                  Passthrough for: maestro studio

Global options:
  --session <name>        Session name (default: "default")
  --json                  Print a single JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output (use structured output)
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent doctor --json
  mobile-dev-agent session set --platform ios --device "iphone-latest" --app-id com.example.app
  mobile-dev-agent ui snapshot -i --with-screenshot --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent doctor --help`

```
doctor - Check toolchain dependencies for iOS/Android automation

Usage:
  mobile-dev-agent doctor [options]

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent doctor
  mobile-dev-agent doctor --json

Exit codes:
  0 all checks passed
  1 one or more checks failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent session --help`

```
session - Manage per-session defaults (platform/device/app/env)

Usage:
  mobile-dev-agent session <subcommand> [options]

Subcommands:
  show                   Show current session defaults
  set                    Set session defaults
  unset                  Unset a specific default
  reset                  Clear session defaults and last snapshot

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent session show --json
  mobile-dev-agent session set --platform ios --device "iphone-latest" --app-id com.example.app

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent session show --help`

```
session show - Show current session defaults

Usage:
  mobile-dev-agent session show [options]

Options:
  --session <name>        Session name (default: "default")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent session show
  mobile-dev-agent session show --session default --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent session set --help`

```
session set - Set session defaults (persisted)

Usage:
  mobile-dev-agent session set [options]

Options:
  --session <name>        Session name (default: "default")
  --platform <ios|android>
                          Platform default (no default)
  --device <selector>     Device selector default (no default)
  --app-id <id>           App id default (bundle id / package name) (no default)
  --app <path>            App path default (.app/.apk) (no default)
  --env <KEY=VALUE>       Add/replace an env var (repeatable) (default: none)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent session set --platform ios --device "iphone-latest" --app-id com.example.app
  mobile-dev-agent session set --env EMAIL=test@example.com --env PASS=secret --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent session unset --help`

```
session unset - Unset a specific session default

Usage:
  mobile-dev-agent session unset <key> [options]

Keys:
  platform
  device
  app-id
  app
  env.KEY               Unset a specific env var (example: env.EMAIL)

Options:
  --session <name>        Session name (default: "default")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent session unset device
  mobile-dev-agent session unset env.EMAIL --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent session reset --help`

```
session reset - Clear session defaults and last snapshot

Usage:
  mobile-dev-agent session reset [options]

Options:
  --session <name>        Session name (default: "default")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent session reset
  mobile-dev-agent session reset --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent device --help`

```
device - Manage simulators/devices and capture screenshots

Usage:
  mobile-dev-agent device <subcommand> [options]

Subcommands:
  list                   List available devices
  boot                   Boot/start a device
  shutdown               Shutdown an iOS simulator
  erase                  Erase an iOS simulator
  screenshot             Capture a screenshot from a device

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device list --platform all
  mobile-dev-agent device boot --platform ios --device "iphone-latest"

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent device list --help`

```
device list - List available devices

Usage:
  mobile-dev-agent device list [options]

Options:
  --platform <ios|android|all>
                          Platform filter (default: "ios")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device list
  mobile-dev-agent device list --platform all --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent device boot --help`

```
device boot - Boot/start a device

Usage:
  mobile-dev-agent device boot [options]

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     iOS: booted|iphone-latest|ipad-latest|<udid>|<name>
                          Android: <adb device id> (default: session.device)
  --avd <name>            Android AVD name to start (optional)
  --wait                  Wait for device to be ready (default: true)
  --headless              Android emulator headless (default: false)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device boot --platform ios --device "iphone-latest"
  mobile-dev-agent device boot --platform android --avd Pixel_6 --wait --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent device shutdown --help`

```
device shutdown - Shutdown an iOS simulator

Usage:
  mobile-dev-agent device shutdown [options]

Options:
  --device <selector>     iOS selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device shutdown --device booted
  mobile-dev-agent device shutdown --device "iphone-latest" --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent device erase --help`

```
device erase - Erase an iOS simulator (destructive)

Usage:
  mobile-dev-agent device erase [options]

Options:
  --device <selector>     iOS selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device erase --device booted
  mobile-dev-agent device erase --device "iphone-latest" --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent device screenshot --help`

```
device screenshot - Capture a screenshot from a device

Usage:
  mobile-dev-agent device screenshot [options]

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --out <path>            Output path (default: run_dir/artifacts/screenshot.png)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent device screenshot --device booted
  mobile-dev-agent device screenshot --platform android --device emulator-5554 --out /tmp/screen.png --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent app --help`

```
app - Build/install/launch/terminate apps

Usage:
  mobile-dev-agent app <subcommand> [options]

Subcommands:
  build-ios               Build an iOS Simulator .app via xcodebuild
  install                 Install an app (.app or .apk) to a device
  uninstall               Uninstall an app by app id
  launch                  Launch an app by app id
  terminate               Terminate an app by app id
  id                      Extract app id from an app bundle

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app build-ios --project MyApp.xcodeproj --scheme MyApp
  mobile-dev-agent app install --app /path/MyApp.app --device "iphone-latest" --boot

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app build-ios --help`

```
app build-ios - Build an iOS Simulator .app via xcodebuild

Usage:
  mobile-dev-agent app build-ios [options]

Options:
  --project <path>        Path to .xcodeproj (required unless --workspace)
  --workspace <path>      Path to .xcworkspace (required unless --project)
  --scheme <name>         Scheme name (required)
  --configuration <name>  Build configuration (default: "Debug")
  --destination <value>   Destination alias or xcodebuild destination (default: "iphone-latest")
  --derived-data <dir>    DerivedData directory (default: cache-managed)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app build-ios --project MyApp.xcodeproj --scheme MyApp
  mobile-dev-agent app build-ios --workspace MyApp.xcworkspace --scheme MyApp --destination booted --json

Exit codes:
  0 success (returns built app path)
  1 build failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app install --help`

```
app install - Install an app (.app or .apk) to a device

Usage:
  mobile-dev-agent app install [options]

Options:
  --app <path>            Path to .app (iOS) or .apk (Android) (required)
  --platform <ios|android>
                          Platform override (default: inferred from --app or session.platform)
  --device <selector>     Device selector (default: session.device)
  --boot                  Boot device if needed (default: false)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app install --app /path/MyApp.app --device "iphone-latest" --boot
  mobile-dev-agent app install --app /path/app.apk --platform android --device emulator-5554 --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app uninstall --help`

```
app uninstall - Uninstall an app by app id

Usage:
  mobile-dev-agent app uninstall [options]

Options:
  --app-id <id>           App id (bundle id / package name) (required)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app uninstall --platform ios --device booted --app-id com.example.app
  mobile-dev-agent app uninstall --platform android --device emulator-5554 --app-id com.example.app --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app launch --help`

```
app launch - Launch an app by app id

Usage:
  mobile-dev-agent app launch [options]

Options:
  --app-id <id>           App id (bundle id / package name) (required)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app launch --platform ios --device booted --app-id com.example.app
  mobile-dev-agent app launch --platform android --device emulator-5554 --app-id com.example.app --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app terminate --help`

```
app terminate - Terminate an app by app id

Usage:
  mobile-dev-agent app terminate [options]

Options:
  --app-id <id>           App id (bundle id / package name) (required)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app terminate --platform ios --device booted --app-id com.example.app
  mobile-dev-agent app terminate --platform android --device emulator-5554 --app-id com.example.app --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent app id --help`

```
app id - Extract app id from an app bundle

Usage:
  mobile-dev-agent app id [options]

Options:
  --app <path>            Path to .app (iOS) or .apk (Android) (required)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent app id --app /path/MyApp.app
  mobile-dev-agent app id --app /path/app.apk --json

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent ui --help`

```
ui - Snapshot native UI and interact using refs (@eN)

Usage:
  mobile-dev-agent ui <subcommand> [options]

Subcommands:
  snapshot                Capture UI snapshot and generate refs
  tap                     Tap an element (supports @eN or --ref eN)
  type                    Type text
  press                   Press a navigation/keyboard key
  swipe                   Swipe gesture
  assert-visible           Assert something becomes visible
  assert-not-visible       Assert something becomes not visible
  find                    Query the last snapshot (print or tap)

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui snapshot -i --with-screenshot --json
  mobile-dev-agent ui tap @e12

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui snapshot --help`

```
ui snapshot - Capture a native UI snapshot and generate refs for agent interaction

Usage:
  mobile-dev-agent ui snapshot [options]

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  -i, --interactive-only  Include only interactable elements (default: true)
  --with-screenshot       Capture a screenshot artifact (default: true)
  --timeout-ms <n>        Driver timeout in ms (default: 15000)
  --out <path>            Write snapshot JSON to an explicit path (default: run_dir/artifacts/ui_snapshot.json)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Refs:
  - Snapshot assigns refs e1..eN to elements.
  - Target by CLI ref token: @e12
  - Or target explicitly: --ref e12
  - The latest snapshot is saved to the session for later @eN usage.

Examples:
  mobile-dev-agent ui snapshot -i --json
  mobile-dev-agent ui snapshot --platform android --device emulator-5554 --with-screenshot --json

Exit codes:
  0 success
  1 snapshot failed
  2 usage error
  127 missing dependency (e.g., AXe for iOS)
```

## `mobile-dev-agent ui tap --help`

```
ui tap - Tap an element

Usage:
  mobile-dev-agent ui tap <selector> [options]
  mobile-dev-agent ui tap --ref <eN> [options]

Selectors:
  @eN                     Tap element ref from the latest snapshot (preferred)
  coords:x,y              Tap explicit coordinates
  text:"Exact Label"      Tap an element by exact name from the latest snapshot
  id:"Identifier"         Tap an element by platform-specific identifier (if available)

Options:
  --ref <eN>              Explicit ref (example: e12)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --timeout-ms <n>        Driver timeout in ms (default: 15000)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui tap @e12
  mobile-dev-agent ui tap --ref e12 --json

Exit codes:
  0 success
  1 tap failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui type --help`

```
ui type - Type text

Usage:
  mobile-dev-agent ui type "<text>" [options]

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --timeout-ms <n>        Driver timeout in ms (default: 15000)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Notes:
  - Android v1 supports a limited character set for ui type. For complex input, use flow run.

Examples:
  mobile-dev-agent ui type "hello"
  mobile-dev-agent ui type "test@example.com" --json

Exit codes:
  0 success
  1 type failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui press --help`

```
ui press - Press a navigation/keyboard key

Usage:
  mobile-dev-agent ui press <key> [options]

Keys:
  back
  enter
  tab
  escape
  home

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui press back
  mobile-dev-agent ui press enter --json

Exit codes:
  0 success
  1 press failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui swipe --help`

```
ui swipe - Swipe gesture

Usage:
  mobile-dev-agent ui swipe <direction|coords> [options]

Directions:
  up|down|left|right

Coords:
  coords:x1,y1,x2,y2

Options:
  --amount-px <n>         Distance for directional swipes (default: 300)
  --duration-ms <n>       Duration for coordinate swipes (default: 300)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui swipe down --amount-px 500
  mobile-dev-agent ui swipe coords:10,100,10,20 --duration-ms 600 --json

Exit codes:
  0 success
  1 swipe failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui assert-visible --help`

```
ui assert-visible - Assert something becomes visible (polls snapshots)

Usage:
  mobile-dev-agent ui assert-visible "<query>" [options]

Options:
  --timeout-ms <n>        Timeout in ms (default: 10000)
  --interval-ms <n>       Poll interval in ms (default: 300)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui assert-visible "Welcome"
  mobile-dev-agent ui assert-visible "Home" --timeout-ms 20000 --json

Exit codes:
  0 success
  1 assertion failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui assert-not-visible --help`

```
ui assert-not-visible - Assert something becomes not visible (polls snapshots)

Usage:
  mobile-dev-agent ui assert-not-visible "<query>" [options]

Options:
  --timeout-ms <n>        Timeout in ms (default: 10000)
  --interval-ms <n>       Poll interval in ms (default: 300)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui assert-not-visible "Loading"
  mobile-dev-agent ui assert-not-visible "Error" --json

Exit codes:
  0 success
  1 assertion failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent ui find --help`

```
ui find - Query the last snapshot (print or tap)

Usage:
  mobile-dev-agent ui find [options] <action>

Actions:
  print                  Print matching elements
  tap                    Tap the first matching element

Options:
  --role <role>          Role filter (optional)
  --name <exact>         Exact name match (optional)
  --contains <substr>    Substring name match (optional)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent ui find --role button --contains "Sign" print
  mobile-dev-agent ui find --role button --name "Sign in" tap --json

Exit codes:
  0 success
  1 find failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent flow --help`

```
flow - Run ad-hoc Maestro steps (stdin or file)

Usage:
  mobile-dev-agent flow <subcommand> [options]

Subcommands:
  run                    Run steps from stdin or a flow file

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent flow run --platform ios --device booted --app-id com.example.app <<'YAML'
  - launchApp
  - assertVisible: "Home"
  YAML

Exit codes:
  0 success
  1 command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent flow run --help`

```
flow run - Run steps from stdin or a flow file (Maestro)

Usage:
  mobile-dev-agent flow run [options]
  mobile-dev-agent flow run --flow <path> [options]

Options:
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --app-id <id>           App id to embed into the generated flow header (optional)
  --app <path>            Install this app before running (optional)
  --flow <path>           Run an existing flow file instead of stdin (optional)
  --format <noop|junit|html>
                          Report format (default: "noop")
  --output <path>         Report output path (default: run_dir/artifacts/report.* when format != noop)
  --no-reinstall-driver   Pass --no-reinstall-driver to Maestro (default: false)
  --env <KEY=VALUE>       Pass env var to Maestro (repeatable) (default: none)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent flow run --platform ios --device booted --app-id com.example.app <<'YAML'
  - launchApp
  - assertVisible: "Home"
  YAML
  mobile-dev-agent flow run --flow flows/login.yaml --format junit --json

Exit codes:
  0 success
  1 flow failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent test --help`

```
test - Run Maestro flows (file/dir) with reports

Usage:
  mobile-dev-agent test [options]

Options:
  --flow <path>           Path to flow file or directory (required)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --boot                  Boot device if needed (default: false)
  --app <path>            Install this app before running (optional)
  --format <noop|junit|html>
                          Report format (default: "noop")
  --output <path>         Report output path (default: none)
  --debug-output <dir>    Maestro debug output directory (default: run_dir/artifacts/maestro-debug)
  --test-output-dir <dir> Maestro test output directory (default: run_dir/artifacts/maestro-test-output)
  --no-reinstall-driver   Pass --no-reinstall-driver to Maestro (default: false)
  --env <KEY=VALUE>       Pass env var to Maestro (repeatable) (default: none)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent test --flow flows --device "iphone-latest" --boot --format junit --output /tmp/report.xml
  mobile-dev-agent test --flow flows/login.yaml --no-reinstall-driver --json

Exit codes:
  0 success
  1 test failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent gc --help`

```
gc - Clean cache and old run artifacts

Usage:
  mobile-dev-agent gc [options]

Options:
  --dry-run               Print what would be deleted (default: false)
  --keep-last <n>         Keep last N runs (default: 20)
  --keep-failure-days <n> Keep failed runs for N days (default: 7)
  --max-bytes <n>         Max total cache size in bytes (default: 2147483648)
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent gc --dry-run
  mobile-dev-agent gc --keep-last 50 --max-bytes 4294967296 --json

Exit codes:
  0 success
  1 gc failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent logs --help`

```
logs - View logs (Live mode for --follow)

Usage:
  mobile-dev-agent logs <subcommand> [options]

Subcommands:
  tail                   Print logs once or follow

Options:
  --json                  Print JSON result to stdout (non-follow only)
  --jsonl                 Stream JSON events (required for --follow)
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent logs tail
  mobile-dev-agent logs tail --follow

Exit codes:
  0 success
  1 logs failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent logs tail --help`

```
logs tail - Print logs once or follow (Live mode for --follow)

Usage:
  mobile-dev-agent logs tail [options]

Options:
  --follow                Follow logs (starts Live mode) (default: false)
  --platform <ios|android>
                          Platform (default: session.platform or "ios")
  --device <selector>     Device selector (default: session.device)
  --app-id <id>           Filter logs to an app id if supported (optional)
  --json                  Print JSON result to stdout (non-follow only)
  --jsonl                 Stream JSON events; final line is the JSON result (follow emits events continuously)
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent logs tail --platform ios --device booted
  mobile-dev-agent logs tail --follow --platform android --device emulator-5554

Exit codes:
  0 success
  1 logs failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent repl --help`

```
repl - Interactive mode (starts Live mode)

Usage:
  mobile-dev-agent repl [options]

Options:
  --session <name>        Session name (default: "default")
  --jsonl                 Stream JSON events (default: true)
  -h, --help              Show help

Examples:
  mobile-dev-agent repl
  mobile-dev-agent repl --session default

Exit codes:
  0 success
  1 repl failed
  2 usage error
  127 missing dependency
```

---

## `mobile-dev-agent live --help`

```
live - Manage Live mode (optional)

Usage:
  mobile-dev-agent live <subcommand> [options]

Subcommands:
  start                  Start Live mode
  status                 Show Live mode status
  stop                   Stop Live mode

Options:
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent live start --ttl 10m
  mobile-dev-agent live stop

Exit codes:
  0 success
  1 live command failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent live start --help`

```
live start - Start Live mode

Usage:
  mobile-dev-agent live start [options]

Options:
  --session <name>        Session name (default: "default")
  --ttl <duration>        Idle timeout (default: "10m")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent live start
  mobile-dev-agent live start --ttl 30m --json

Exit codes:
  0 success
  1 live start failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent live status --help`

```
live status - Show Live mode status

Usage:
  mobile-dev-agent live status [options]

Options:
  --session <name>        Session name (default: "default")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent live status
  mobile-dev-agent live status --json

Exit codes:
  0 success
  1 live status failed
  2 usage error
  127 missing dependency
```

## `mobile-dev-agent live stop --help`

```
live stop - Stop Live mode

Usage:
  mobile-dev-agent live stop [options]

Options:
  --session <name>        Session name (default: "default")
  --json                  Print JSON result to stdout
  --jsonl                 Stream JSON events; final line is the JSON result
  --quiet                 Suppress human output
  --verbose               Emit more detail while staying structured
  -h, --help              Show help

Examples:
  mobile-dev-agent live stop
  mobile-dev-agent live stop --json

Exit codes:
  0 success
  1 live stop failed
  2 usage error
  127 missing dependency
```

