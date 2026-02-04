import path from "node:path";
import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { createRunDir, RunContext } from "../lib/run.js";
import { adbListDevices, adbWaitForDevice, startEmulator, waitForBootCompleted, waitForEmulator } from "../lib/android.js";
import { resolveAndroidDevice, resolveAndroidDeviceDefault, resolveAndroidDeviceSelector, resolveIOSDeviceSelector } from "../lib/deviceResolver.js";
import {
  simctlBoot,
  simctlBootStatus,
  simctlErase,
  simctlListDevicesJSON,
  simctlShutdown,
  type IOSDevice,
} from "../lib/simctl.js";
import { flattenIOSDevices } from "../lib/simctl.js";
import { ensureDir } from "../lib/paths.js";
import { readSession } from "../lib/session.js";
import { usageError } from "../lib/cliError.js";
import { parsePlatform, parsePlatformOrAll } from "../lib/platform.js";

type DeviceListValues = { platform?: string };

export async function cmdDeviceList({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ ios: IOSDevice[]; android: unknown[] }>; exitCode: number }> {
  const startedAt = new Date();
  const { values } = parseArgs({
    args: argv,
    options: { platform: { type: "string", default: "ios" } },
    allowPositionals: true,
    strict: true,
  }) as { values: DeviceListValues };

  const platform = parsePlatformOrAll(values.platform, { defaultValue: "ios" });

  let ios: IOSDevice[] = [];
  let android: unknown[] = [];

  if (platform === "ios" || platform === "all") {
    const json = await simctlListDevicesJSON();
    ios = flattenIOSDevices(json).filter((d) => d.isAvailable);
  }
  if (platform === "android" || platform === "all") {
    android = await adbListDevices();
  }

  const envelope = createEnvelope({
    ok: true,
    command_name: "device.list",
    command_argv: ["device", "list", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { ios, android },
    error: null,
    next_steps: [
      { label: "Boot a device", argv: ["device", "boot"] },
      { label: "Take a screenshot", argv: ["device", "screenshot"] },
    ],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    const lines: string[] = [];
    if (platform === "ios" || platform === "all") {
      lines.push("iOS Simulators:");
      for (const d of ios) lines.push(`${d.state === "Booted" ? "*" : " "} ${d.name}  ${d.udid}  (${d.runtime})`);
      if (!ios.length) lines.push("  (none)");
    }
    if (platform === "android" || platform === "all") {
      if (lines.length) lines.push("");
      lines.push("Android Devices:");
      for (const d of android as { id: string; state: string; model?: string }[]) {
        const state = d.state === "device" ? "*" : " ";
        lines.push(`${state} ${d.id}  ${d.state}${d.model ? `  (${d.model})` : ""}`);
      }
      if (!android.length) lines.push("  (none)");
    }
    io.human(lines);
  }

  return { envelope, exitCode: 0 };
}

type DeviceBootValues = { platform?: string; device?: string; avd?: string; wait?: boolean; headless?: boolean };

export async function cmdDeviceBoot({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ device: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      avd: { type: "string" },
      wait: { type: "boolean", default: true },
      headless: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: DeviceBootValues };

  const platform = parsePlatform(values.platform || "ios");

  if (platform === "ios") {
    const selector = values.device?.trim() || "iphone-latest";
    const device = await resolveIOSDeviceSelector(selector);
    await simctlBoot(device.udid);
    if (values.wait) await simctlBootStatus(device.udid);

    const ok = true;
	    const envelope = createEnvelope({
      ok,
      command_name: "device.boot",
      command_argv: ["device", "boot", ...argv],
      session: sessionName,
      platform: "ios",
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: null,
      artifacts: [],
      target: { device: { platform: "ios", id: device.udid, name: device.name }, app: null },
	      data: { device: { ...device, state: "Booted" } },
	      error: null,
	      next_steps: [{ label: "Take a screenshot", argv: ["device", "screenshot", "--platform", "ios", "--device", device.udid] }],
	    });

    if (io.config.mode === "human" && !io.config.quiet) {
      io.human([`Booted: ${device.name} (${device.udid})`]);
    }
    return { envelope, exitCode: 0 };
  }

  // Android
  const wait = Boolean(values.wait);
  const headless = Boolean(values.headless);
  const selector = values.device?.trim();

  if (!values.avd && !selector) {
    throw usageError("device boot requires --avd <name> or --device <selector> for Android (or set session.device)");
  }

  const initialDevices = values.avd && !selector ? await adbListDevices() : [];
  let bootedId: string | null = null;
  if (values.avd) startEmulator(values.avd, { headless });

  if (wait) {
    if (selector) {
      await adbWaitForDevice(selector);
      await waitForBootCompleted(selector);
      bootedId = selector;
    } else {
      const emulator = await waitForEmulator({ existingIds: initialDevices.map((d) => d.id) });
      if (!emulator) throw new Error("No Android emulator detected after boot.");
      bootedId = emulator.id;
      await adbWaitForDevice(bootedId);
      await waitForBootCompleted(bootedId);
    }
  }

  const chosen = bootedId ? await resolveAndroidDeviceSelector(bootedId) : selector ? await resolveAndroidDeviceSelector(selector) : await resolveAndroidDeviceDefault();
  if (!chosen) throw new Error("No Android device detected after boot.");

  const envelope = createEnvelope({
    ok: true,
    command_name: "device.boot",
    command_argv: ["device", "boot", ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    target: { device: { platform: "android", id: chosen.id, name: null }, app: null },
    data: { device: chosen },
    error: null,
    next_steps: [{ label: "Take a screenshot", argv: ["device", "screenshot", "--platform", "android", "--device", chosen.id] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Ready: ${chosen.id} (${chosen.state})`]);
  }
  return { envelope, exitCode: 0 };
}

type DeviceIOSOnlyValues = { device?: string };

export async function cmdDeviceShutdown({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ device: IOSDevice }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  if (session.defaults.platform === "android") throw usageError("device shutdown is iOS-only.");
  const { values } = parseArgs({
    args: argv,
    options: { device: { type: "string", default: session.defaults.device?.selector ?? "booted" } },
    allowPositionals: true,
    strict: true,
  }) as { values: DeviceIOSOnlyValues };

  const selector = values.device?.trim() || "booted";
  const device = await resolveIOSDeviceSelector(selector);
  await simctlShutdown(device.udid);

  const envelope = createEnvelope({
    ok: true,
    command_name: "device.shutdown",
    command_argv: ["device", "shutdown", ...argv],
    session: sessionName,
    platform: "ios",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    target: { device: { platform: "ios", id: device.udid, name: device.name }, app: null },
    data: { device: { ...device, state: "Shutdown" } },
    error: null,
    next_steps: [{ label: "Boot a device", argv: ["device", "boot", "--platform", "ios"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Shutdown: ${device.name} (${device.udid})`]);
  }
  return { envelope, exitCode: 0 };
}

export async function cmdDeviceErase({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ device: IOSDevice }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  if (session.defaults.platform === "android") throw usageError("device erase is iOS-only.");
  const { values } = parseArgs({
    args: argv,
    options: { device: { type: "string", default: session.defaults.device?.selector ?? "booted" } },
    allowPositionals: true,
    strict: true,
  }) as { values: DeviceIOSOnlyValues };

  const selector = values.device?.trim() || "booted";
  const device = await resolveIOSDeviceSelector(selector);
  await simctlErase(device.udid);

  const envelope = createEnvelope({
    ok: true,
    command_name: "device.erase",
    command_argv: ["device", "erase", ...argv],
    session: sessionName,
    platform: "ios",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    target: { device: { platform: "ios", id: device.udid, name: device.name }, app: null },
    data: { device },
    error: null,
    next_steps: [{ label: "Boot a device", argv: ["device", "boot", "--platform", "ios"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Erased: ${device.name} (${device.udid})`]);
  }
  return { envelope, exitCode: 0 };
}

type DeviceScreenshotValues = { platform?: string; device?: string; out?: string };

export async function cmdDeviceScreenshot({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ path: string }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      out: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: DeviceScreenshotValues };

  const platform = parsePlatform(values.platform || "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const outPath = values.out ? path.resolve(values.out) : path.join(run.artifactsDir, "screenshot.png");
  await ensureDir(path.dirname(outPath));

  let targetDevice: ResultEnvelope["target"]["device"] = null;

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    targetDevice = { platform: "ios", id: device.udid, name: device.name };
    const res = await run.execLogged("simctl", "screenshot", "xcrun", ["simctl", "io", device.udid, "screenshot", outPath], {
      timeoutMs: 60000,
    });
    if (!res.ok) throw new Error(`simctl screenshot failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  } else {
    const device = await resolveAndroidDevice(values.device);
    targetDevice = { platform: "android", id: device.id, name: null };
    await run.execBinaryToFile("adb", "screencap", "adb", ["-s", device.id, "exec-out", "screencap", "-p"], {
      timeoutMs: 60000,
      outPath,
    });
  }

  run.artifact({ type: "screenshot", path: outPath, mime: "image/png" });

  const envelope = createEnvelope({
    ok: true,
    command_name: "device.screenshot",
    command_argv: ["device", "screenshot", ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: targetDevice, app: null },
    artifacts: run.artifacts,
    data: { path: outPath },
    error: null,
    next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i", "--with-screenshot"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Screenshot saved: ${outPath}`]);
  }

  return { envelope, exitCode: 0 };
}
