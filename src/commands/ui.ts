import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { createRunDir, RunContext } from "../lib/run.js";
import { readSession, readLastSnapshot, writeLastSnapshot, writeLastTarget } from "../lib/session.js";
import { usageError, dependencyError, CLIError } from "../lib/cliError.js";
import { resolveAxePath } from "../lib/axe.js";
import { resolveAndroidDevice, resolveIOSDeviceSelector } from "../lib/deviceResolver.js";
import { parseIOSAxeDescribeUI, parseAndroidUiautomatorXml, buildSnapshot, isUISnapshot, type UISnapshot, type CanonicalElement } from "../lib/uiSnapshot.js";
import { parseSelectorToken, resolveTapTarget, type ParsedSelector } from "../lib/selector.js";
import { parsePlatform } from "../lib/platform.js";

function isOlderThanMs(ts: string, ms: number): boolean {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > ms;
}

async function loadLastSnapshotOrThrow(sessionName: string): Promise<UISnapshot> {
  const raw = await readLastSnapshot(sessionName);
  if (!raw) throw new CLIError("No snapshot found for this session. Run: mobile-dev-agent ui snapshot -i", { exitCode: 1 });
  if (!isUISnapshot(raw)) {
    throw new CLIError("Invalid snapshot file for this session. Re-run: mobile-dev-agent ui snapshot -i", { exitCode: 1 });
  }
  return raw;
}

type UiSnapshotValues = {
  platform?: string;
  device?: string;
  "interactive-only"?: boolean;
  i?: boolean;
  "with-screenshot"?: boolean;
  "timeout-ms"?: string;
  out?: string;
};

async function takeIosSnapshot({
  values,
  session,
  run,
  interactiveOnly,
  withScreenshot,
  timeoutMs,
}: {
  values: UiSnapshotValues;
  session: Awaited<ReturnType<typeof readSession>>;
  run: RunContext;
  interactiveOnly: boolean;
  withScreenshot: boolean;
  timeoutMs: number;
}): Promise<{ snapshot: UISnapshot; targetDevice: ResultEnvelope["target"]["device"] }> {
  const selector = values.device?.trim() || "booted";
  const device = await resolveIOSDeviceSelector(selector);
  if (device.state !== "Booted") {
    throw new CLIError(`iOS device is not booted (${device.name}). Run: mobile-dev-agent device boot --platform ios --device "${selector}"`, { exitCode: 1 });
  }
  const targetDevice: ResultEnvelope["target"]["device"] = { platform: "ios", id: device.udid, name: device.name };

  const axePath = await resolveAxePath();
  const rawPath = path.join(run.artifactsDir, "ui_snapshot.raw.json");
  const res = await run.execLogged("axe", "describe-ui", axePath, ["describe-ui", "--udid", device.udid], {
    timeoutMs,
    stdoutPath: rawPath,
  });
  if (!res.ok) {
    if (res.code === null) {
      throw dependencyError("Missing dependency: AXe CLI (axe).", [
        "Set MOBILE_DEV_AGENT_AXE_PATH to the absolute path of the axe binary, or put `axe` on PATH.",
      ]);
    }
    throw new CLIError(`axe describe-ui failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });
  }
  run.artifact({ type: "ui_snapshot_raw", path: rawPath, mime: "application/json" });

  let parsed: unknown;
  try {
    const rawJson = await fs.readFile(rawPath, "utf8");
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new CLIError("axe describe-ui returned invalid JSON.", { exitCode: 1, details: [String(e)] });
  }

  const elements = parseIOSAxeDescribeUI(parsed, { interactiveOnly });
  const snapshot = buildSnapshot({
    platform: "ios",
    deviceId: device.udid,
    appId: session.defaults.app?.app_id ?? null,
    elements,
  });

  if (withScreenshot) {
    const screenshotPath = path.join(run.artifactsDir, "screenshot.png");
    const ss = await run.execLogged("simctl", "screenshot", "xcrun", ["simctl", "io", device.udid, "screenshot", screenshotPath], {
      timeoutMs: 60000,
    });
    if (!ss.ok) throw new CLIError(`simctl screenshot failed (code=${ss.code})`, { exitCode: 1, details: [ss.stderr || ss.stdout] });
    run.artifact({ type: "screenshot", path: screenshotPath, mime: "image/png" });
  }

  return { snapshot, targetDevice };
}

async function takeAndroidSnapshot({
  values,
  session,
  run,
  interactiveOnly,
  withScreenshot,
  timeoutMs,
}: {
  values: UiSnapshotValues;
  session: Awaited<ReturnType<typeof readSession>>;
  run: RunContext;
  interactiveOnly: boolean;
  withScreenshot: boolean;
  timeoutMs: number;
}): Promise<{ snapshot: UISnapshot; targetDevice: ResultEnvelope["target"]["device"] }> {
  const device = await resolveAndroidDevice(values.device);
  const targetDevice: ResultEnvelope["target"]["device"] = { platform: "android", id: device.id, name: null };

  const dumpRes = await run.execLogged("adb", "uiautomator_dump", "adb", ["-s", device.id, "shell", "uiautomator", "dump", "/sdcard/mobile-dev-agent-ui.xml"], {
    timeoutMs,
  });
  if (!dumpRes.ok) throw new CLIError(`uiautomator dump failed (code=${dumpRes.code})`, { exitCode: 1, details: [dumpRes.stderr || dumpRes.stdout] });

  const xmlPath = path.join(run.artifactsDir, "ui_dump.xml");
  const pullRes = await run.execLogged("adb", "pull_ui_dump", "adb", ["-s", device.id, "pull", "/sdcard/mobile-dev-agent-ui.xml", xmlPath], {
    timeoutMs,
  });
  if (!pullRes.ok) throw new CLIError(`adb pull failed (code=${pullRes.code})`, { exitCode: 1, details: [pullRes.stderr || pullRes.stdout] });
  run.artifact({ type: "ui_dump_xml", path: xmlPath, mime: "application/xml" });

  const xml = await fs.readFile(xmlPath, "utf8");
  const elements = parseAndroidUiautomatorXml(xml, { interactiveOnly });
  const snapshot = buildSnapshot({
    platform: "android",
    deviceId: device.id,
    appId: session.defaults.app?.app_id ?? null,
    elements,
  });

  if (withScreenshot) {
    const screenshotPath = path.join(run.artifactsDir, "screenshot.png");
    await run.execBinaryToFile("adb", "screencap", "adb", ["-s", device.id, "exec-out", "screencap", "-p"], {
      timeoutMs: 60000,
      outPath: screenshotPath,
    });
    run.artifact({ type: "screenshot", path: screenshotPath, mime: "image/png" });
  }

  return { snapshot, targetDevice };
}

export async function cmdUiSnapshot({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ snapshot: UISnapshot }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      i: { type: "boolean", short: "i", default: true },
      "interactive-only": { type: "boolean", default: true },
      "with-screenshot": { type: "boolean", default: true },
      "timeout-ms": { type: "string", default: "15000" },
      out: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiSnapshotValues };

  const platform = parsePlatform(values.platform || "ios");

  const interactiveOnly = Boolean(values["interactive-only"] ?? values.i ?? true);
  const withScreenshot = Boolean(values["with-screenshot"] ?? true);
  const timeoutMs = Number(values["timeout-ms"] ?? "15000");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw usageError(`Invalid --timeout-ms: ${values["timeout-ms"]}`);

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const outPath = values.out ? path.resolve(values.out) : path.join(run.artifactsDir, "ui_snapshot.json");

  const { snapshot, targetDevice } =
    platform === "ios"
      ? await takeIosSnapshot({ values, session, run, interactiveOnly, withScreenshot, timeoutMs })
      : await takeAndroidSnapshot({ values, session, run, interactiveOnly, withScreenshot, timeoutMs });

  await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  run.artifact({ type: "ui_snapshot", path: outPath, mime: "application/json" });
  await writeLastSnapshot(sessionName, snapshot);

  const nextSteps = snapshot.elements.length ? [{ label: "Tap an element", argv: ["ui", "tap", `@${snapshot.elements[0].ref}`] }] : [];

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.snapshot",
    command_argv: ["ui", "snapshot", ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: targetDevice, app: { app_id: session.defaults.app?.app_id ?? null, app_path: session.defaults.app?.app_path ?? null } },
    artifacts: run.artifacts,
    data: { snapshot },
    error: null,
    next_steps: nextSteps,
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([snapshot.tree]);
  }

  return { envelope, exitCode: 0 };
}

type UiTapValues = { ref?: string; platform?: string; device?: string; "timeout-ms"?: string };

async function tapWithResolvedTarget({
  selector,
  platform,
  deviceSelector,
  timeoutMs,
  sessionName,
  sessionAppId,
  sessionAppPath,
  io,
}: {
  selector: ParsedSelector;
  platform: "ios" | "android";
  deviceSelector: string;
  timeoutMs: number;
  sessionName: string;
  sessionAppId: string | null;
  sessionAppPath: string | null;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ tap: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const snapshot = selector.kind === "coords" ? null : await loadLastSnapshotOrThrow(sessionName);
  const stale = snapshot?.taken_at ? isOlderThanMs(snapshot.taken_at, 5 * 60 * 1000) : false;

  let targetDevice: ResultEnvelope["target"]["device"] = null;
  let tapX = 0;
  let tapY = 0;
  let element: CanonicalElement | null = null;

  if (platform === "ios") {
    const device = await resolveIOSDeviceSelector(deviceSelector || "booted");
    if (device.state !== "Booted") throw new CLIError(`iOS device is not booted (${device.name}).`, { exitCode: 1 });
    targetDevice = { platform: "ios", id: device.udid, name: device.name };

    if (selector.kind === "coords") {
      tapX = selector.x;
      tapY = selector.y;
    } else {
      if (!snapshot) throw new CLIError("No snapshot available for selector-based tap. Run: mobile-dev-agent ui snapshot -i", { exitCode: 1 });
      const resolved = resolveTapTarget(snapshot, selector);
      tapX = resolved.x;
      tapY = resolved.y;
      element = resolved.kind === "element" ? resolved.element : null;
    }

    const axePath = await resolveAxePath();
    let res;
    if (element?.selectors.ios.id) {
      res = await run.execLogged("axe", "tap", axePath, ["tap", "--id", element.selectors.ios.id, "--udid", device.udid], {
        timeoutMs,
      });
    } else if (element?.selectors.ios.label) {
      res = await run.execLogged("axe", "tap", axePath, ["tap", "--label", element.selectors.ios.label, "--udid", device.udid], {
        timeoutMs,
      });
    } else {
      res = await run.execLogged("axe", "tap", axePath, ["tap", "-x", String(tapX), "-y", String(tapY), "--udid", device.udid], { timeoutMs });
    }
    if (!res.ok) {
      if (res.code === null) {
        throw dependencyError("Missing dependency: AXe CLI (axe).", [
          "Set MOBILE_DEV_AGENT_AXE_PATH to the absolute path of the axe binary, or put `axe` on PATH.",
        ]);
      }
      throw new CLIError(`tap failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });
    }
  } else {
    const androidDevice = await resolveAndroidDevice(deviceSelector);
    targetDevice = { platform: "android", id: androidDevice.id, name: null };

    if (selector.kind === "coords") {
      tapX = selector.x;
      tapY = selector.y;
    } else {
      if (!snapshot) throw new CLIError("No snapshot available for selector-based tap. Run: mobile-dev-agent ui snapshot -i", { exitCode: 1 });
      const resolved = resolveTapTarget(snapshot, selector);
      tapX = resolved.x;
      tapY = resolved.y;
      element = resolved.kind === "element" ? resolved.element : null;
    }

    const res = await run.execLogged("adb", "tap", "adb", ["-s", androidDevice.id, "shell", "input", "tap", String(tapX), String(tapY)], {
      timeoutMs,
    });
    if (!res.ok) {
      if (res.code === null) throw dependencyError("Missing dependency: adb", ["Install Android Platform Tools and ensure `adb` is on PATH."]);
      throw new CLIError(`tap failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });
    }
  }

  const nextSteps = stale ? [{ label: "Refresh snapshot", argv: ["ui", "snapshot", "-i"] }] : [];

  const tapInfo = {
    selector,
    x: tapX,
    y: tapY,
    ref: element?.ref ?? null,
    name: element?.name ?? null,
    role: element?.role ?? null,
  };
  await writeLastTarget(sessionName, { at: new Date().toISOString(), tap: tapInfo });

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.tap",
    command_argv: ["ui", "tap", ...(selector.kind === "ref" ? [`@${selector.ref}`] : []), ...[]],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: targetDevice, app: { app_id: sessionAppId, app_path: sessionAppPath } },
    artifacts: run.artifacts,
    data: { tap: tapInfo },
    error: null,
    next_steps: nextSteps,
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Tapped: (${tapX}, ${tapY})${element ? ` @${element.ref} ${element.name}` : ""}`]);
  }

  return { envelope, exitCode: 0 };
}

export async function cmdUiTap({
  argv,
  sessionName,
  io,
  selectorToken,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  selectorToken: string | null;
}): Promise<{ envelope: ResultEnvelope<{ tap: unknown }>; exitCode: number }> {
  const session = await readSession(sessionName);
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      ref: { type: "string" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      "timeout-ms": { type: "string", default: "15000" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiTapValues; positionals: string[] };

  const platform = parsePlatform(values.platform || "ios");
  const timeoutMs = Number(values["timeout-ms"] ?? 15000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw usageError(`Invalid --timeout-ms: ${values["timeout-ms"]}`);

  const positionalSelector = selectorToken ?? positionals[0] ?? null;
  const ref = values.ref?.trim();
  if (ref && positionalSelector) throw usageError("Provide either <selector> OR --ref, not both.");
  const rawSelector = ref ? `@${ref}` : positionalSelector;
  if (!rawSelector) throw usageError("ui tap requires <selector> or --ref <eN>.");

  const selector = ref ? ({ kind: "ref", ref } as ParsedSelector) : parseSelectorToken(rawSelector);
  return await tapWithResolvedTarget({
    selector,
    platform,
    deviceSelector: values.device?.trim() || "",
    timeoutMs,
    sessionName,
    sessionAppId: session.defaults.app?.app_id ?? null,
    sessionAppPath: session.defaults.app?.app_path ?? null,
    io,
  });
}

type UiTypeValues = { platform?: string; device?: string; "timeout-ms"?: string };

function encodeAndroidText(input: string): string {
  // Allowed: A-Z a-z 0-9 @ . _ - : / + and space
  const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@._-:/+ ";
  for (const ch of input) {
    if (!allowed.includes(ch)) {
      throw usageError(
        "Android ui type v1 only supports: A-Z a-z 0-9 @ . _ - : / + and space. For complex typing, use: mobile-dev-agent flow run"
      );
    }
  }
  return input.split(" ").join("%s");
}

export async function cmdUiType({
  argv,
  sessionName,
  io,
  textArgs,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  textArgs: string[];
}): Promise<{ envelope: ResultEnvelope<{ typed: string }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      "timeout-ms": { type: "string", default: "15000" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiTypeValues };

  const text = textArgs.join(" ");
  if (!text) throw usageError('ui type requires a "<text>" argument');

  const platform = parsePlatform(values.platform || "ios");
  const timeoutMs = Number(values["timeout-ms"] ?? 15000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw usageError(`Invalid --timeout-ms: ${values["timeout-ms"]}`);

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  let targetDevice: ResultEnvelope["target"]["device"] = null;

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    if (device.state !== "Booted") throw new CLIError(`iOS device is not booted (${device.name}).`, { exitCode: 1 });
    targetDevice = { platform: "ios", id: device.udid, name: device.name };
    const axePath = await resolveAxePath();
    const res = await run.execLogged("axe", "type", axePath, ["type", text, "--udid", device.udid], { timeoutMs });
    if (!res.ok) {
      if (res.code === null) throw dependencyError("Missing dependency: AXe CLI (axe).", ["Set MOBILE_DEV_AGENT_AXE_PATH or put `axe` on PATH."]);
      throw new CLIError(`type failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });
    }
  } else {
    const device = await resolveAndroidDevice(values.device);
    targetDevice = { platform: "android", id: device.id, name: null };
    const encoded = encodeAndroidText(text);
    const res = await run.execLogged("adb", "type", "adb", ["-s", device.id, "shell", "input", "text", encoded], { timeoutMs });
    if (!res.ok) {
      if (res.code === null) throw dependencyError("Missing dependency: adb", ["Install Android Platform Tools and ensure `adb` is on PATH."]);
      throw new CLIError(`type failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });
    }
  }

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.type",
    command_argv: ["ui", "type", text, ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: targetDevice, app: { app_id: session.defaults.app?.app_id ?? null, app_path: session.defaults.app?.app_path ?? null } },
    artifacts: run.artifacts,
    data: { typed: text },
    error: null,
    next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) io.human(["OK"]);

  return { envelope, exitCode: 0 };
}

type UiPressValues = { platform?: string; device?: string };

const ANDROID_KEYCODES: Record<string, string> = {
  back: "KEYCODE_BACK",
  enter: "KEYCODE_ENTER",
  tab: "KEYCODE_TAB",
  escape: "KEYCODE_ESCAPE",
  home: "KEYCODE_HOME",
};

export async function cmdUiPress({
  argv,
  sessionName,
  io,
  key,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  key: string;
}): Promise<{ envelope: ResultEnvelope<{ pressed: string }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiPressValues };

  const platform = parsePlatform(values.platform || "ios");

  if (platform === "ios") {
    throw new CLIError("ui press is not implemented for iOS in v1. Use flow run for navigation keys.", { exitCode: 1 });
  }

  const code = ANDROID_KEYCODES[key];
  if (!code) throw usageError(`Unknown key: ${key}`);

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const device = await resolveAndroidDevice(values.device);

  const res = await run.execLogged("adb", "keyevent", "adb", ["-s", device.id, "shell", "input", "keyevent", code], { timeoutMs: 15000 });
  if (!res.ok) throw new CLIError(`press failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.press",
    command_argv: ["ui", "press", key, ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_id: session.defaults.app?.app_id ?? null, app_path: session.defaults.app?.app_path ?? null } },
    artifacts: run.artifacts,
    data: { pressed: key },
    error: null,
    next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i", "--platform", "android"] }],
  });
  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human(["OK"]);
  return { envelope, exitCode: 0 };
}

type UiSwipeValues = { "amount-px"?: string; "duration-ms"?: string; platform?: string; device?: string };

function parseSwipeCoords(token: string): { x1: number; y1: number; x2: number; y2: number } {
  if (!token.startsWith("coords:")) throw usageError(`Invalid coords: ${token}`);
  const parts = token.slice("coords:".length).split(",");
  if (parts.length !== 4) throw usageError(`Invalid coords: ${token}`);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) throw usageError(`Invalid coords: ${token}`);
  const [x1, y1, x2, y2] = nums;
  return { x1, y1, x2, y2 };
}

function parseWmSize(output: string): { w: number; h: number } | null {
  const m = output.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

export async function cmdUiSwipe({
  argv,
  sessionName,
  io,
  directionOrCoords,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  directionOrCoords: string;
}): Promise<{ envelope: ResultEnvelope<{ swipe: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      "amount-px": { type: "string", default: "300" },
      "duration-ms": { type: "string", default: "300" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiSwipeValues };

  const platform = parsePlatform(values.platform || "ios");
  if (platform === "ios") throw new CLIError("ui swipe is not implemented for iOS in v1. Use flow run for gestures.", { exitCode: 1 });

  const amountPx = Number(values["amount-px"] ?? 300);
  const durationMs = Number(values["duration-ms"] ?? 300);
  if (!Number.isFinite(amountPx) || amountPx <= 0) throw usageError(`Invalid --amount-px: ${values["amount-px"]}`);
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw usageError(`Invalid --duration-ms: ${values["duration-ms"]}`);

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const device = await resolveAndroidDevice(values.device);

  let coords: { x1: number; y1: number; x2: number; y2: number };
  const input = directionOrCoords.trim().toLowerCase();
  if (input.startsWith("coords:")) {
    coords = parseSwipeCoords(directionOrCoords);
  } else {
    const sizeRes = await run.execLogged("adb", "wm_size", "adb", ["-s", device.id, "shell", "wm", "size"], { timeoutMs: 15000 });
    const size = parseWmSize(sizeRes.stdout || "") ?? { w: 1080, h: 1920 };
    const cx = Math.round(size.w / 2);
    const cy = Math.round(size.h / 2);
    if (input === "up") coords = { x1: cx, y1: cy, x2: cx, y2: cy - amountPx };
    else if (input === "down") coords = { x1: cx, y1: cy, x2: cx, y2: cy + amountPx };
    else if (input === "left") coords = { x1: cx, y1: cy, x2: cx - amountPx, y2: cy };
    else if (input === "right") coords = { x1: cx, y1: cy, x2: cx + amountPx, y2: cy };
    else throw usageError(`Invalid direction: ${directionOrCoords} (expected up|down|left|right or coords:x1,y1,x2,y2)`);
  }

  const res = await run.execLogged(
    "adb",
    "swipe",
    "adb",
    ["-s", device.id, "shell", "input", "swipe", String(coords.x1), String(coords.y1), String(coords.x2), String(coords.y2), String(durationMs)],
    { timeoutMs: 15000 }
  );
  if (!res.ok) throw new CLIError(`swipe failed (code=${res.code})`, { exitCode: 1, details: [res.stderr || res.stdout] });

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.swipe",
    command_argv: ["ui", "swipe", directionOrCoords, ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_id: session.defaults.app?.app_id ?? null, app_path: session.defaults.app?.app_path ?? null } },
    artifacts: run.artifacts,
    data: { swipe: { ...coords, duration_ms: durationMs } },
    error: null,
    next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i", "--platform", "android"] }],
  });
  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human(["OK"]);
  return { envelope, exitCode: 0 };
}

type UiAssertValues = { "timeout-ms"?: string; "interval-ms"?: string; platform?: string; device?: string };

async function takeQuickSnapshot({
  platform,
  deviceSelector,
  session,
  run,
}: {
  platform: "ios" | "android";
  deviceSelector: string;
  session: Awaited<ReturnType<typeof readSession>>;
  run: RunContext;
}): Promise<UISnapshot> {
  if (platform === "ios") {
    const device = await resolveIOSDeviceSelector(deviceSelector || "booted");
    const axePath = await resolveAxePath();
    const res = await run.execLogged("axe", "describe-ui", axePath, ["describe-ui", "--udid", device.udid], { timeoutMs: 15000 });
    if (!res.ok) throw new Error(`axe describe-ui failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    const parsed = JSON.parse(res.stdout) as unknown;
    const elements = parseIOSAxeDescribeUI(parsed, { interactiveOnly: false });
    return buildSnapshot({ platform: "ios", deviceId: device.udid, appId: session.defaults.app?.app_id ?? null, elements });
  }

  const device = await resolveAndroidDevice(deviceSelector);
  await run.execLogged("adb", "uiautomator_dump", "adb", ["-s", device.id, "shell", "uiautomator", "dump", "/sdcard/mobile-dev-agent-ui.xml"], {
    timeoutMs: 15000,
  });
  const xmlPath = path.join(run.artifactsDir, "ui_dump.xml");
  await run.execLogged("adb", "pull_ui_dump", "adb", ["-s", device.id, "pull", "/sdcard/mobile-dev-agent-ui.xml", xmlPath], { timeoutMs: 15000 });
  const xml = await fs.readFile(xmlPath, "utf8");
  const elements = parseAndroidUiautomatorXml(xml, { interactiveOnly: false });
  return buildSnapshot({ platform: "android", deviceId: device.id, appId: session.defaults.app?.app_id ?? null, elements });
}

export async function cmdUiAssertVisible({
  argv,
  sessionName,
  io,
  query,
  negate,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  query: string;
  negate: boolean;
}): Promise<{ envelope: ResultEnvelope<{ query: string; found: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      "timeout-ms": { type: "string", default: "10000" },
      "interval-ms": { type: "string", default: "300" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiAssertValues };

  const platform = parsePlatform(values.platform || "ios");
  const timeoutMs = Number(values["timeout-ms"] ?? 10000);
  const intervalMs = Number(values["interval-ms"] ?? 300);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw usageError(`Invalid --timeout-ms: ${values["timeout-ms"]}`);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw usageError(`Invalid --interval-ms: ${values["interval-ms"]}`);

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const deadline = Date.now() + timeoutMs;
  let last: UISnapshot | null = null;
  let found = false;
  let interval = intervalMs;
  const maxInterval = Math.max(intervalMs, 2000);

  while (Date.now() <= deadline) {
    last = await takeQuickSnapshot({ platform, deviceSelector: values.device?.trim() || "", session, run });
    await writeLastSnapshot(sessionName, last);
    found = last.elements.some((e) => e.name.includes(query));
    if ((!negate && found) || (negate && !found)) break;
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(maxInterval, Math.ceil(interval * 1.4));
  }

  const ok = (!negate && found) || (negate && !found);
  const envelope = createEnvelope({
    ok,
    command_name: negate ? "ui.assert-not-visible" : "ui.assert-visible",
    command_argv: ["ui", negate ? "assert-not-visible" : "assert-visible", query, ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: null, app: { app_id: session.defaults.app?.app_id ?? null, app_path: session.defaults.app?.app_path ?? null } },
    artifacts: run.artifacts,
    data: { query, found },
    error: ok ? null : { code: "ASSERTION_FAILED", message: "Assertion failed.", details: [`query=${JSON.stringify(query)}`, `found=${found}`] },
    next_steps: [{ label: "Capture a snapshot", argv: ["ui", "snapshot", "-i", "--with-screenshot"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human([ok ? "OK" : "FAIL"]);
  return { envelope, exitCode: ok ? 0 : 1 };
}

type UiFindValues = { role?: string; name?: string; contains?: string; platform?: string; device?: string };

export async function cmdUiFind({
  argv,
  sessionName,
  io,
  action,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  action: string;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      role: { type: "string" },
      name: { type: "string" },
      contains: { type: "string" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: UiFindValues };

  const snapshot = await loadLastSnapshotOrThrow(sessionName);
  let matches = snapshot.elements;
  if (values.role) matches = matches.filter((e) => e.role === values.role);
  if (values.name) matches = matches.filter((e) => e.name === values.name);
  if (values.contains) matches = matches.filter((e) => e.name.includes(values.contains!));

  const act = action.trim().toLowerCase();
  if (!["print", "tap"].includes(act)) throw usageError(`Unknown action: ${action} (expected print or tap)`);

  if (act === "tap") {
    if (!matches.length) {
      const envelope = createEnvelope({
        ok: false,
        command_name: "ui.find",
        command_argv: ["ui", "find", ...argv, action],
        session: sessionName,
        platform: snapshot.platform,
        started_at: startedAt.toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        run_dir: null,
        artifacts: [],
        data: { matches: [], action: act },
        error: { code: "NOT_FOUND", message: "No matches.", details: [] },
        next_steps: [{ label: "Capture a snapshot", argv: ["ui", "snapshot", "-i"] }],
      });
      if (io.config.mode === "human" && !io.config.quiet) io.human(["No matches."]);
      return { envelope, exitCode: 1 };
    }

    const p = parsePlatform(values.platform || "ios");

    return await tapWithResolvedTarget({
      selector: { kind: "ref", ref: matches[0].ref },
      platform: p,
      deviceSelector: values.device?.trim() || "",
      timeoutMs: 15000,
      sessionName,
      sessionAppId: session.defaults.app?.app_id ?? null,
      sessionAppPath: session.defaults.app?.app_path ?? null,
      io,
    });
  }

  const envelope = createEnvelope({
    ok: true,
    command_name: "ui.find",
    command_argv: ["ui", "find", ...argv, action],
    session: sessionName,
    platform: snapshot.platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { matches, action: act },
    error: null,
    next_steps: matches[0] ? [{ label: "Tap first match", argv: ["ui", "tap", `@${matches[0].ref}`] }] : [],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(matches.map((e) => `@${e.ref} [${e.role}] ${e.name}`));
  }
  return { envelope, exitCode: 0 };
}
