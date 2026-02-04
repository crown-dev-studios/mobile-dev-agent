# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-02-04

### Added

- **Structured output modes**: `--json` (single JSON result) and `--jsonl` (event stream + final result) for all commands
- **Session management**: `session show|set|unset|reset` for platform/device/app/env defaults that persist across commands
- **Device command group**: `device list|boot|shutdown|erase|screenshot` for simulator and device management
- **App command group**: `app build-ios|install|uninstall|launch|terminate|id` for application lifecycle
- **UI command group**: `ui snapshot|tap|type|press|swipe|assert-visible|assert-not-visible|find` for agent-native "inspect → act → verify" loops with ref-based element targeting (`@eN`)
- **Flow command**: `flow run` for ad-hoc Maestro steps from stdin or file
- **Live mode**: `live start|status|stop` and `repl` for interactive sessions
- **Logs command**: `logs tail` with optional `--follow` for device log streaming
- **GC command**: `gc` for cleaning cache and old run artifacts with configurable retention
- **Canonical help outputs**: Stable, machine-readable `--help` for all commands

### Changed

- CLI structure reorganized around command groups (`device`, `app`, `ui`, `flow`, `logs`, `live`)
- All commands now emit structured envelopes with consistent fields: `ok`, `version`, `command`, `session`, `platform`, `timing`, `run_dir`, `target`, `artifacts`, `data`, `error`, `next_steps`

### Removed

- **Deprecated aliases**: `devices list`, `build-ios`, and `studio` passthrough have been removed. Use `device list`, `app build-ios`, and `maestro studio` directly.

## [0.1.0] - 2026-01-15

### Added

- Initial release with basic iOS simulator automation
- Doctor command for toolchain dependency checks
- Maestro test runner integration
