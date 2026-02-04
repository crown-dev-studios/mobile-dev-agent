import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { createRunDir, RunContext } from "../lib/run.js";
import { readSession } from "../lib/session.js";
import { usageError } from "../lib/cliError.js";
import { resolveAndroidDevice, resolveIOSDeviceSelector } from "../lib/deviceResolver.js";
import { resolveIOSDestination, simctlBoot, simctlBootStatus } from "../lib/simctl.js";
import { findBuiltApps, pickSingleApp } from "../lib/xcodebuild.js";
import { extractAppId } from "../lib/appId.js";
import { ensureDir } from "../lib/paths.js";
import { parsePlatform } from "../lib/platform.js";

type AppBuildIOSValues = {
  project?: string;
  workspace?: string;
  scheme?: string;
  configuration?: string;
  destination?: string;
  "derived-data"?: string;
};

export async function cmdAppBuildIOS({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ app_path: string; derived_data: string; destination: string }>; exitCode: number }> {
  const startedAt = new Date();
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      workspace: { type: "string" },
      scheme: { type: "string" },
      configuration: { type: "string", default: "Debug" },
      destination: { type: "string", default: "iphone-latest" },
      "derived-data": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: AppBuildIOSValues };

  if (!values.project && !values.workspace) {
    throw usageError("app build-ios requires --project <path> or --workspace <path>");
  }
  if (!values.scheme) {
    throw usageError("app build-ios requires --scheme <name>");
  }

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const derivedData =
    values["derived-data"]?.trim() ||
    path.join(run.artifactsDir, "derived_data", `${values.scheme}-${Date.now()}`) ||
    path.join(os.tmpdir(), "mobile-dev-agent-derived-data", `${values.scheme}-${Date.now()}`);
  await ensureDir(derivedData);

  const { destination } = await resolveIOSDestination(values.destination);
  const args = [];
  if (values.project) args.push("-project", values.project);
  if (values.workspace) args.push("-workspace", values.workspace);
  args.push("-scheme", values.scheme);
  args.push("-sdk", "iphonesimulator");
  args.push("-configuration", values.configuration || "Debug");
  args.push("-destination", destination);
  args.push("-derivedDataPath", derivedData);
  args.push("build");

  const res = await run.execLogged("xcodebuild", "build", "xcodebuild", args, { timeoutMs: 60 * 60 * 1000 });
  if (!res.ok) {
	    const durationMs = Date.now() - startedAt.getTime();
	    const envelope = createEnvelope({
	      ok: false,
	      command_name: "app.build-ios",
	      command_argv: ["app", "build-ios", ...argv],
	      session: sessionName,
	      platform: "ios",
	      started_at: startedAt.toISOString(),
	      duration_ms: durationMs,
	      run_dir: runDir,
	      artifacts: run.artifacts,
	      data: { app_path: "", derived_data: derivedData, destination },
	      error: { code: "PROCESS_FAILED", message: `xcodebuild failed (code=${res.code ?? "unknown"})`, details: [(res.stderr || res.stdout || "").slice(0, 2000)] },
	      next_steps: [],
	    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.error(`Build failed (see ${res.logPath}).`);
    return { envelope, exitCode: 1 };
  }

  const apps = await findBuiltApps({ derivedData, configuration: values.configuration });
  const picked = pickSingleApp(apps, { scheme: values.scheme });
  if (!picked.ok || !picked.appPath) {
	    const durationMs = Date.now() - startedAt.getTime();
	    const envelope = createEnvelope({
	      ok: false,
	      command_name: "app.build-ios",
	      command_argv: ["app", "build-ios", ...argv],
	      session: sessionName,
	      platform: "ios",
	      started_at: startedAt.toISOString(),
	      duration_ms: durationMs,
	      run_dir: runDir,
	      artifacts: run.artifacts,
	      data: { app_path: "", derived_data: derivedData, destination },
	      error: { code: "BUILD_OUTPUT_MISSING", message: picked.reason || "Build completed but no .app found.", details: apps },
	      next_steps: [],
	    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.error(envelope.error?.message ?? "Build failed.");
    return { envelope, exitCode: 1 };
  }

  run.artifact({ type: "app_bundle", path: picked.appPath, mime: "application/octet-stream" });

	  const envelope = createEnvelope({
	    ok: true,
	    command_name: "app.build-ios",
	    command_argv: ["app", "build-ios", ...argv],
	    session: sessionName,
	    platform: "ios",
	    started_at: startedAt.toISOString(),
	    duration_ms: Date.now() - startedAt.getTime(),
	    run_dir: runDir,
	    artifacts: run.artifacts,
	    data: { app_path: picked.appPath, derived_data: derivedData, destination },
	    error: null,
	    next_steps: [{ label: "Install the app", argv: ["app", "install", "--app", picked.appPath] }],
	  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Built .app: ${picked.appPath}`, `DerivedData: ${derivedData}`]);
  }

  return { envelope, exitCode: 0 };
}

type AppInstallValues = { app?: string; platform?: string; device?: string; boot?: boolean };

export async function cmdAppInstall({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ installed: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      app: { type: "string" },
      platform: { type: "string" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      boot: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: AppInstallValues };

  const appPath = values.app?.trim();
  if (!appPath) throw usageError("app install requires --app <path>");
  const stat = await fs.stat(appPath).catch(() => null);
  if (!stat) throw usageError(`--app path does not exist: ${appPath}`);

  const inferred = appPath.endsWith(".apk") ? "android" : appPath.endsWith(".app") ? "ios" : null;
  const platform = parsePlatform(values.platform?.trim() ? values.platform : inferred ?? session.defaults.platform ?? "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  if (platform === "ios") {
    if (!stat.isDirectory() || !appPath.endsWith(".app")) throw usageError(`--app must point to a .app bundle directory. Got: ${appPath}`);
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    if (values.boot) {
      await simctlBoot(device.udid);
      await simctlBootStatus(device.udid);
    } else if (device.state !== "Booted") {
      throw usageError(`iOS device is not booted (${device.name}). Re-run with --boot or use: mobile-dev-agent device boot --device "${selector}"`);
    }

    const res = await run.execLogged("simctl", "install", "xcrun", ["simctl", "install", device.udid, appPath], { timeoutMs: 120000 });
    if (!res.ok) throw new Error(`simctl install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());

    const envelope = createEnvelope({
      ok: true,
      command_name: "app.install",
      command_argv: ["app", "install", ...argv],
      session: sessionName,
      platform: "ios",
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: runDir,
      target: { device: { platform: "ios", id: device.udid, name: device.name }, app: { app_path: appPath, app_id: session.defaults.app?.app_id ?? null } },
      artifacts: run.artifacts,
      data: { installed: true },
      error: null,
      next_steps: session.defaults.app?.app_id ? [{ label: "Launch the app", argv: ["app", "launch", "--app-id", session.defaults.app.app_id] }] : [],
    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.human([`Installed ${appPath} to ${device.name} (${device.udid})`]);
    return { envelope, exitCode: 0 };
  }

  if (!stat.isFile() || !appPath.endsWith(".apk")) throw usageError(`--app must point to a .apk file for Android. Got: ${appPath}`);
  const device = await resolveAndroidDevice(values.device);
  const res = await run.execLogged("adb", "install", "adb", ["-s", device.id, "install", "-r", appPath], { timeoutMs: 120000 });
  if (!res.ok) throw new Error(`adb install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());

  const envelope = createEnvelope({
    ok: true,
    command_name: "app.install",
    command_argv: ["app", "install", ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_path: appPath, app_id: session.defaults.app?.app_id ?? null } },
    artifacts: run.artifacts,
    data: { installed: true },
    error: null,
    next_steps: session.defaults.app?.app_id
      ? [{ label: "Launch the app", argv: ["app", "launch", "--platform", "android", "--app-id", session.defaults.app.app_id] }]
      : [],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) io.human([`Installed ${appPath} to ${device.id}`]);
  return { envelope, exitCode: 0 };
}

type AppIdOnlyValues = { "app-id"?: string; platform?: string; device?: string };

export async function cmdAppUninstall({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ uninstalled: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      "app-id": { type: "string" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: AppIdOnlyValues };

  const appId = values["app-id"]?.trim();
  if (!appId) throw usageError("app uninstall requires --app-id <id>");
  const platform = parsePlatform(values.platform || "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    const res = await run.execLogged("simctl", "uninstall", "xcrun", ["simctl", "uninstall", device.udid, appId], { timeoutMs: 60000 });
    if (!res.ok) throw new Error(`simctl uninstall failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    const envelope = createEnvelope({
      ok: true,
      command_name: "app.uninstall",
      command_argv: ["app", "uninstall", ...argv],
      session: sessionName,
      platform: "ios",
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: runDir,
      target: { device: { platform: "ios", id: device.udid, name: device.name }, app: { app_id: appId, app_path: null } },
      artifacts: run.artifacts,
      data: { uninstalled: true },
      error: null,
      next_steps: [{ label: "Install an app", argv: ["app", "install"] }],
    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.human([`Uninstalled ${appId} from ${device.name} (${device.udid})`]);
    return { envelope, exitCode: 0 };
  }

  const device = await resolveAndroidDevice(values.device);
  const res = await run.execLogged("adb", "uninstall", "adb", ["-s", device.id, "uninstall", appId], { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`adb uninstall failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  const envelope = createEnvelope({
    ok: true,
    command_name: "app.uninstall",
    command_argv: ["app", "uninstall", ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_id: appId, app_path: null } },
    artifacts: run.artifacts,
    data: { uninstalled: true },
    error: null,
    next_steps: [{ label: "Install an app", argv: ["app", "install", "--platform", "android"] }],
  });
  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human([`Uninstalled ${appId} from ${device.id}`]);
  return { envelope, exitCode: 0 };
}

export async function cmdAppLaunch({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ launched: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      "app-id": { type: "string" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: AppIdOnlyValues };

  const appId = values["app-id"]?.trim();
  if (!appId) throw usageError("app launch requires --app-id <id>");
  const platform = parsePlatform(values.platform || "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    const res = await run.execLogged("simctl", "launch", "xcrun", ["simctl", "launch", device.udid, appId], { timeoutMs: 60000 });
    if (!res.ok) throw new Error(`simctl launch failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    const envelope = createEnvelope({
      ok: true,
      command_name: "app.launch",
      command_argv: ["app", "launch", ...argv],
      session: sessionName,
      platform: "ios",
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: runDir,
      target: { device: { platform: "ios", id: device.udid, name: device.name }, app: { app_id: appId, app_path: null } },
      artifacts: run.artifacts,
      data: { launched: true },
      error: null,
      next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i"] }],
    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.human([`Launched ${appId} on ${device.name} (${device.udid})`]);
    return { envelope, exitCode: 0 };
  }

  const device = await resolveAndroidDevice(values.device);
  const res = await run.execLogged("adb", "launch", "adb", ["-s", device.id, "shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"], {
    timeoutMs: 60000,
  });
  if (!res.ok) throw new Error(`adb launch failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  const envelope = createEnvelope({
    ok: true,
    command_name: "app.launch",
    command_argv: ["app", "launch", ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_id: appId, app_path: null } },
    artifacts: run.artifacts,
    data: { launched: true },
    error: null,
    next_steps: [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i", "--platform", "android"] }],
  });
  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human([`Launched ${appId} on ${device.id}`]);
  return { envelope, exitCode: 0 };
}

export async function cmdAppTerminate({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ terminated: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      "app-id": { type: "string" },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: AppIdOnlyValues };

  const appId = values["app-id"]?.trim();
  if (!appId) throw usageError("app terminate requires --app-id <id>");
  const platform = parsePlatform(values.platform || "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    const res = await run.execLogged("simctl", "terminate", "xcrun", ["simctl", "terminate", device.udid, appId], { timeoutMs: 60000 });
    if (!res.ok) throw new Error(`simctl terminate failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    const envelope = createEnvelope({
      ok: true,
      command_name: "app.terminate",
      command_argv: ["app", "terminate", ...argv],
      session: sessionName,
      platform: "ios",
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: runDir,
      target: { device: { platform: "ios", id: device.udid, name: device.name }, app: { app_id: appId, app_path: null } },
      artifacts: run.artifacts,
      data: { terminated: true },
      error: null,
      next_steps: [{ label: "Launch the app", argv: ["app", "launch", "--app-id", appId] }],
    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) io.human([`Terminated ${appId} on ${device.name} (${device.udid})`]);
    return { envelope, exitCode: 0 };
  }

  const device = await resolveAndroidDevice(values.device);
  const res = await run.execLogged("adb", "force-stop", "adb", ["-s", device.id, "shell", "am", "force-stop", appId], { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`adb force-stop failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  const envelope = createEnvelope({
    ok: true,
    command_name: "app.terminate",
    command_argv: ["app", "terminate", ...argv],
    session: sessionName,
    platform: "android",
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: { platform: "android", id: device.id, name: null }, app: { app_id: appId, app_path: null } },
    artifacts: run.artifacts,
    data: { terminated: true },
    error: null,
    next_steps: [{ label: "Launch the app", argv: ["app", "launch", "--platform", "android", "--app-id", appId] }],
  });
  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;
  if (io.config.mode === "human" && !io.config.quiet) io.human([`Terminated ${appId} on ${device.id}`]);
  return { envelope, exitCode: 0 };
}

type AppIdValues = { app?: string };

export async function cmdAppId({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ platform: string; app_id: string }>; exitCode: number }> {
  const startedAt = new Date();
  const { values } = parseArgs({
    args: argv,
    options: { app: { type: "string" } },
    allowPositionals: true,
    strict: true,
  }) as { values: AppIdValues };

  const appPath = values.app?.trim();
  if (!appPath) throw usageError("app id requires --app <path>");

  const { platform, appId } = await extractAppId(appPath);

  const envelope = createEnvelope({
    ok: true,
    command_name: "app.id",
    command_argv: ["app", "id", ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { platform, app_id: appId },
    error: null,
    next_steps: [{ label: "Install the app", argv: ["app", "install", "--app", appPath] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) io.human([appId]);
  return { envelope, exitCode: 0 };
}
