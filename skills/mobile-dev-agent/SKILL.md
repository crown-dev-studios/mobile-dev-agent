---
name: mobile-dev-agent
description: Run the local Mobile Dev Agent CLI (Maestro + simulators/emulators) to build, boot, install, and test iOS/Android apps on a Mac. Use when asked to automate or validate mobile app flows like login, profile, checkout, search, or screenshots on iOS/Android simulators/emulators.
---

# Mobile Dev Agent

## Overview

Use the local `mobile-dev-agent` CLI from this repo to drive Maestro flows against iOS simulators and Android emulators. Prefer machine-readable output (`--json`) for agent workflows and keep commands scoped to the local filesystem.

## Quick Start (local)

- Build once before running commands:
  - `npm install`
  - `npm run build`
- Run from repo root:
  - `node dist/src/bin/mobile-dev-agent.js <command> ...`

## Workflow

1. Gather inputs (ask if missing):
   - Platform: `ios` or `android`
   - Device name (Simulator/Emulator)
   - App info: `.app`/`.apk` path OR bundle id OR Xcode project + scheme
   - Flow(s): path to Maestro YAML or the concrete steps to encode
   - Output: report format and path if needed
2. Validate environment: `doctor`
3. Discover devices: `device list --platform <ios|android|all>`
4. Boot device (if required): `device boot --platform <ios|android> --device "<selector>"`
5. Build/install app (as needed):
   - iOS build: `app build-ios --project <path> --scheme <Scheme>`
   - Install: `app install --platform <ios|android> --app <path> --device "<selector>" --boot`
6. Run flows:
   - File-based: `test --platform <ios|android> --flow <path|dir> --device "<selector>" --boot`
   - Ad-hoc: `flow run ...` with YAML on stdin
7. Capture artifacts (optional): `device screenshot --platform <ios|android> --device "<selector>" --out <path>`

## Prompting Guidance

- Be specific about device, app, and flow. Ask for missing details before running.
- When converting a natural-language request to a flow, confirm:
  - The exact screen labels or accessibility text to tap/assert
  - The expected outcome after each step
  - Any required credentials or test data
- Use `--json` for structured output when available.

Example clarifying question:
“Which platform and device should I use, and do you have an app path or bundle id? If you want a Maestro flow generated, what exact UI text should be tapped or asserted?”

## References

- Use `references/cli-cheatsheet.md` when you need exact command flags or a quick command template.
- See repo `README.md` for broader context and examples.
