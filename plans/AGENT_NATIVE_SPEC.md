# mobile-dev-agent vNext (No MCP) — Agent-Native Native Mobile Automation Spec

Version: 1.0 (planning draft)  
Last updated: 2026-02-04

This document is a **decision-complete spec** for evolving `mobile-dev-agent` into an agent-native CLI for native mobile development that does **not** depend on MCP.

---

## 0) Summary

`mobile-dev-agent` will provide a first-class “inspect → act → verify” loop for agents on native mobile UI:

- `mobile-dev-agent ui snapshot -i --json` returns a **machine-readable UI snapshot** and assigns **refs** `e1..eN`.
- `mobile-dev-agent ui tap @e12` targets an element ref from the most recent snapshot.
- `mobile-dev-agent ui type "text"` types into the focused field.
- `mobile-dev-agent ui assert-visible "Welcome"` polls until a condition is met.

Runtime model:

- **Default (non-Live):** no background process required; refs work via small on-disk session state.
- **Live mode (opt-in):** starts a local background process for streaming/watch/repl and faster hot loops.

Disk hygiene:

- Session state is constant-size (overwritten; does not accumulate).
- Run artifacts live in OS cache and are GC-managed via `mobile-dev-agent gc`.

Platforms (v1):

- **iOS Simulator:** Xcode + `xcrun simctl` + **AXe**
- **Android:** `adb` + `uiautomator dump`

Maestro remains the flow runner for reports/debug output.

---

## 1) Decisions (locked)

1. **Platforms (v1):** iOS Simulator + Android.
2. **UI drivers (v1):**
   - iOS UI snapshot/actions: **AXe CLI**
   - Android UI snapshot/actions: `adb` + `uiautomator dump` (+ `adb shell input …`)
   - Maestro: flow execution and reporting (junit/html/noop).
3. **Runtime:**
   - Default **non-daemon** with **on-disk sessions**.
   - Optional **Live mode** daemon is opt-in, only improves speed/streaming/watch/repl.
4. **Ref syntax:**
   - CLI preferred: `@e12`
   - CLI explicit alias: `--ref e12`
   - JSON stores refs as `"e12"` (no `@`).
5. **Logs/artifacts naming:** no `stdout.txt`/`stderr.txt`.
   - `trace.jsonl` for structured events
   - combined per-process logs: `logs/001_<tool>_<action>.log`

---

## 2) Goals / Non-goals

### Goals

- Agents can reliably perform native UI automation using refs.
- Every command supports stable machine-readable output (`--json`) and streamable output (`--jsonl`).
- No repo litter: default outputs do not write to the project directory.
- Help output is canonicalized for migration (`plans/CLI_HELP_CANON.md`).

### Non-goals (v1)

- Cloud device farm support.
- Full replacement for XCTest/Espresso.
- Physical iOS device support by default (can be added later).

---

## 3) Disk layout and hygiene

### 3.1 Base directories

**State directory** (small, persistent):

- macOS: `~/Library/Application Support/mobile-dev-agent/`
- Linux: `$XDG_STATE_HOME/mobile-dev-agent/` or `~/.local/state/mobile-dev-agent/`

Override: `MOBILE_DEV_AGENT_STATE_DIR`

**Cache directory** (GC-managed):

- macOS: `~/Library/Caches/mobile-dev-agent/`
- Linux: `$XDG_CACHE_HOME/mobile-dev-agent/` or `~/.cache/mobile-dev-agent/`

Override: `MOBILE_DEV_AGENT_CACHE_DIR`

### 3.2 Session files (constant-size; overwritten)

Per session `<S>`:

- `<STATE>/sessions/<S>/session.json`
- `<STATE>/sessions/<S>/last_snapshot.json`
- `<STATE>/sessions/<S>/last_target.json`

Rules:

- These files are overwritten, not appended.
- No timestamped accumulation in `<STATE>`.

### 3.3 Run artifacts (GC-managed)

Run dir: `<CACHE>/runs/<YYYYMMDD-HHMMSS>-<rand>/`

Structure:

```
<run_dir>/
  result.json
  trace.jsonl
  logs/
    001_<tool>_<action>.log
    002_<tool>_<action>.log
  artifacts/
    screenshot.png
    ui_snapshot.json
    ...
```

Log file format:

- combined stdout+stderr in one file
- each line is prefixed:
  - `RFC3339 <stdout|stderr> | <line>`

### 3.4 GC policy

Defaults:

- keep last `20` run dirs
- keep failed run dirs for `7` days
- cap total cache size at `2 GB`

Config (env overrides):

- `MOBILE_DEV_AGENT_GC_KEEP_LAST`
- `MOBILE_DEV_AGENT_GC_KEEP_FAILURE_DAYS`
- `MOBILE_DEV_AGENT_GC_MAX_BYTES`

Command:

- `mobile-dev-agent gc` enforces the policy and is safe to run anytime.

**GC algorithm (deterministic):**

1. Enumerate `<CACHE>/runs/*` directories.
2. Determine `started_at` and `ok` by reading `result.json` when present; otherwise:
   - `started_at` = timestamp parsed from directory name if possible, else filesystem mtime.
   - `ok` = unknown → treat as failed for retention (but deleteable under size pressure).
3. Keep newest `KEEP_LAST`.
4. Keep failed runs whose age ≤ `KEEP_FAILURE_DAYS`.
5. If total bytes > `MAX_BYTES`, delete oldest remaining runs until under budget.
6. `--dry-run` prints the plan without deleting.

---

## 4) CLI shape

### 4.1 Canonical commands (v1)

- `doctor`
- `session show|set|unset|reset`
- `device list|boot|shutdown|erase|screenshot`
- `app build-ios|install|uninstall|launch|terminate|id`
- `ui snapshot|tap|type|press|swipe|assert-visible|assert-not-visible|find`
- `flow run`
- `test`
- `gc`
- `logs tail`
- `repl`
- `live start|status|stop`

### 4.2 Global flags (all commands)

- `--session <name>` (default: `default`)
- `--json`
- `--jsonl`
- `--quiet`
- `--verbose`
- `-h, --help`

Exit codes:

- `0` success
- `1` handled failure (command ran but did not succeed)
- `2` usage/argument error
- `127` missing dependency

---

## 5) Output contracts

### 5.1 JSON result envelope (all `--json`)

Every command that supports `--json` MUST output exactly one JSON object:

```json
{
  "ok": true,
  "version": "mobile-dev-agent@X.Y.Z",
  "command": { "name": "ui.snapshot", "argv": ["ui","snapshot","-i"] },
  "session": "default",
  "platform": "ios",
  "timing": { "started_at": "RFC3339", "duration_ms": 1234 },
  "run_dir": "/abs/path/or/null",
  "target": {
    "device": { "platform": "ios", "id": "…", "name": "…" },
    "app": { "app_id": "…", "app_path": "…" }
  },
  "artifacts": [
    { "type": "trace", "path": ".../trace.jsonl", "mime": "application/x-ndjson" },
    { "type": "process_log", "path": ".../logs/001_axe_describe-ui.log", "mime": "text/plain" }
  ],
  "data": {},
  "error": null,
  "next_steps": [
    { "label": "Tap an element", "argv": ["ui","tap","@e1"] }
  ]
}
```

### 5.2 JSONL streaming (`--jsonl`)

`--jsonl` prints newline-delimited JSON objects:

- `{"type":"event", ...}`
- final line: `{"type":"result", ...<full envelope>...}`

Minimum event fields:

- `type`: `event`
- `ts`: RFC3339 timestamp
- `event`: `spawn|output|artifact|progress|warning|error`
- `data`: event payload

---

## 6) Sessions

### 6.1 Session schema: `session.json`

```json
{
  "schema_version": 1,
  "defaults": {
    "platform": "ios|android",
    "device": { "selector": "iphone-latest|booted|<udid>|<adbId>" },
    "app": { "app_id": "com.example.app", "app_path": "/path/to/App.app|.apk" },
    "build": {
      "ios": {
        "project": "",
        "workspace": "",
        "scheme": "",
        "configuration": "Debug",
        "destination": "iphone-latest",
        "derived_data": ""
      }
    },
    "env": { "KEY": "VALUE" }
  }
}
```

Notes:

- `session set` updates only provided keys; `session unset` removes keys.
- `session reset` removes `session.json` and clears snapshot/target files.

---

## 7) Native UI snapshot + refs

### 7.1 Canonical element schema

All platform adapters MUST normalize to:

```json
{
  "ref": "e12",
  "role": "button|textbox|link|checkbox|…",
  "name": "Sign in",
  "value": null,
  "bounds": { "x": 0, "y": 0, "w": 0, "h": 0 },
  "states": { "enabled": true, "visible": true, "focused": false, "checked": false },
  "selectors": {
    "ios": { "id": null, "label": null },
    "android": { "resource_id": null, "content_desc": null, "class": null }
  },
  "meta": { "platform": {} }
}
```

### 7.2 `ui snapshot` output contract

`ui snapshot` returns:

- `data.snapshot.snapshot_id` (uuid)
- `data.snapshot.taken_at` (RFC3339)
- `data.snapshot.platform`, `data.snapshot.device_id`, `data.snapshot.app_id` (if known)
- `data.snapshot.tree` (string)
- `data.snapshot.elements` (array)
- `data.snapshot.refs` (map `eN -> element`)

`ui snapshot` MUST write the latest snapshot to:

- `<STATE>/sessions/<S>/last_snapshot.json`

### 7.3 Ref selector rules

Targeting forms:

1. CLI ref token: `@e12` (preferred)
2. Explicit flag: `--ref e12`
3. Coordinates: `coords:x,y`
4. Text query: `text:"Exact Label"`
5. Id query: `id:"Identifier"` (platform-specific when available)

If multiple are provided, error (exit code `2`).

Snapshot staleness:

- If `last_snapshot.json` is older than 5 minutes, include a warning and suggest resnapshot in `next_steps`.

---

## 8) iOS implementation (AXe + simctl + xcodebuild)

### 8.1 Dependencies

- `xcrun simctl` for device management and screenshots
- `xcodebuild` for building simulator apps
- **AXe CLI** for UI snapshot/actions

AXe binary resolution order:

1. `MOBILE_DEV_AGENT_AXE_PATH` (absolute path)
2. bundled binary at `mobile-dev-agent/bundled/axe`
3. `axe` on `PATH`

If AXe is missing:

- exit `127`
- JSON error includes remediation instructions

### 8.2 `ui snapshot` on iOS

- Execute: `axe describe-ui --udid <sim_udid>`
- Store raw output in `artifacts/ui_snapshot.raw.json`
- Parse to canonical elements:
  - compute `bounds`
  - infer `role` and `name`
  - decide interactable set for `--interactive-only`:
    - interactable if role is in the interactable role set AND bounds are non-zero

### 8.3 `ui tap` on iOS

Resolution order:

1. If element supports AXe targeting by `id`, run `axe tap --id <id> --udid <udid>`.
2. Else if supports targeting by `label`, run `axe tap --label <label> --udid <udid>`.
3. Else run coordinate tap to element center: `axe tap -x <cx> -y <cy> --udid <udid>`.

### 8.4 `ui type` on iOS

- `axe type "<text>" --udid <udid>`

### 8.5 `device screenshot` on iOS

- `xcrun simctl io <udid> screenshot <path>`

---

## 9) Android implementation (adb + uiautomator)

### 9.1 `ui snapshot` on Android

- `adb -s <id> shell uiautomator dump /sdcard/mobile-dev-agent-ui.xml`
- `adb -s <id> pull /sdcard/mobile-dev-agent-ui.xml <run_dir>/artifacts/ui_dump.xml`
- Parse XML into canonical elements:
  - bounds from `bounds="[l,t][r,b]"`
  - name priority: `text` then `content-desc` then `resource-id` tail
  - role inference table (v1):
    - `android.widget.Button` → `button`
    - `android.widget.EditText` → `textbox`
    - `android.widget.CheckBox` → `checkbox`
    - `android.widget.Switch` → `switch`
    - otherwise `unknown`
  - interactable if `clickable=true` OR `focusable=true` OR role is in interactable set

### 9.2 `ui tap` on Android

- `adb -s <id> shell input tap <cx> <cy>`

### 9.3 `ui swipe` on Android

- `adb -s <id> shell input swipe <x1> <y1> <x2> <y2> <durationMs>`

### 9.4 `ui press` on Android

Map keys to keyevents:

- `back` → `KEYCODE_BACK`
- `enter` → `KEYCODE_ENTER`
- `tab` → `KEYCODE_TAB`
- `escape` → `KEYCODE_ESCAPE`
- `home` → `KEYCODE_HOME`

### 9.5 `ui type` on Android (v1 constraints)

`adb shell input text` is limited. v1 will be strict:

- Allowed characters: `A-Z a-z 0-9 @ . _ - : / +` and space
- Space encoding: `%s`

If unsupported characters are present:

- exit `2`
- error message recommends using `mobile-dev-agent flow run` for complex typing

---

## 10) Maestro integration (flows)

### 10.1 `flow run`

- Runs ad-hoc steps from stdin or `--flow <path>`.
- Always writes the exact flow used as `artifacts/flow.yaml` (even if stdin).
- Exposes `--no-reinstall-driver` for faster repeated runs.
- Captures Maestro report/debug/test outputs as artifacts and indexes them in JSON.

### 10.2 `test`

- Runs flows from a file/dir with Maestro.
- Exposes `--no-reinstall-driver`.
- Captures artifacts and indexes them in JSON.

---

## 11) Live mode (optional; opt-in)

### 11.1 Purpose

Live mode improves:

- streaming logs/events for long-running operations
- watch/repl workflows
- hot-loop speed (keep state warm)

It is not required for refs.

### 11.2 Files (bounded)

Per session `<S>`:

- `<STATE>/run/<S>/live.sock`
- `<STATE>/run/<S>/live.pid`
- `<STATE>/run/<S>/live.log` (rotating, optional)

### 11.3 Lifecycle

- default idle TTL: 10 minutes (`--ttl`, configurable)
- `live stop` terminates process and removes pid/socket
- stale pid/socket cleanup is automatic

### 11.4 Transport / security

- Unix socket only; no TCP listeners by default.
- Reject HTTP-like payloads.
- Socket dir permissions should be `0700` on POSIX.

---

## 12) Implementation checklist (handoff)

1. Add `plans/CLI_HELP_CANON.md` and ensure the CLI matches it.
2. Implement state/cache dir resolution and session persistence.
3. Implement run dirs, `trace.jsonl`, and per-process combined logs.
4. Implement `ui snapshot` parsers:
   - iOS: AXe `describe-ui` JSON → canonical elements
   - Android: `uiautomator dump` XML → canonical elements
5. Implement selectors:
   - `@eN` and `--ref eN` resolution against `last_snapshot.json`
6. Implement GC policy and `gc --dry-run`.
7. Add fixtures and unit tests for parsers, selectors, and help output.

