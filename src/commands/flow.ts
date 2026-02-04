import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { createRunDir, RunContext } from "../lib/run.js";
import { parseEnvList } from "../lib/env.js";
import { readSession } from "../lib/session.js";
import { usageError } from "../lib/cliError.js";
import { parsePlatform } from "../lib/platform.js";
import { resolveAndroidDevice, resolveIOSDeviceSelector } from "../lib/deviceResolver.js";
import { simctlBoot, simctlBootStatus } from "../lib/simctl.js";

function readStdinOrNull(): string | null {
  if (process.stdin.isTTY) return null;
  const data = readFileSync(0, "utf8");
  return data && data.trim() ? data : null;
}

function withOptionalAppIdHeader(content: string, appId: string | null): string {
  const trimmed = content.trim();
  if (!appId) return `${trimmed}\n`;
  if (/^appId:\s*/m.test(trimmed)) return `${trimmed}\n`;
  return `appId: ${appId}\n---\n${trimmed}\n`;
}

type FlowRunValues = {
  platform?: string;
  device?: string;
  "app-id"?: string;
  app?: string;
  flow?: string;
  format?: string;
  output?: string;
  "no-reinstall-driver"?: boolean;
  env?: string[];
};

export async function cmdFlowRun({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      "app-id": { type: "string" },
      app: { type: "string" },
      flow: { type: "string" },
      format: { type: "string", default: "noop" },
      output: { type: "string" },
      "no-reinstall-driver": { type: "boolean", default: false },
      env: { type: "string", multiple: true, default: [] },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: FlowRunValues };

  const stdinSteps = readStdinOrNull();
  if (stdinSteps && values.flow) throw usageError("Provide either stdin steps OR --flow, not both.");
  if (!stdinSteps && !values.flow) throw usageError("Provide steps via stdin or pass --flow <path>.");

  const platform = parsePlatform(values.platform || "ios");

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const flowContent = values.flow ? await fs.readFile(path.resolve(values.flow), "utf8") : stdinSteps!;
  const appId = values["app-id"]?.trim() || session.defaults.app?.app_id || null;
  const flowYaml = withOptionalAppIdHeader(flowContent, appId);
  const flowPath = path.join(run.artifactsDir, "flow.yaml");
  await fs.writeFile(flowPath, flowYaml, "utf8");
  run.artifact({ type: "flow", path: flowPath, mime: "application/x-yaml" });

  const fmt = String(values.format || "noop").trim().toLowerCase();
  if (!["noop", "junit", "html"].includes(fmt)) throw usageError(`Invalid --format: ${values.format} (expected noop, junit, or html)`);

  let outputPath: string | null = null;
  if (fmt !== "noop") {
    outputPath = values.output?.trim() ? path.resolve(values.output) : path.join(run.artifactsDir, fmt === "junit" ? "report.xml" : "report.html");
    run.artifact({ type: "report", path: outputPath, mime: fmt === "junit" ? "application/xml" : "text/html" });
  }

  const debugOutput = path.join(run.artifactsDir, "maestro-debug");
  const testOutputDir = path.join(run.artifactsDir, "maestro-test-output");
  await fs.mkdir(debugOutput, { recursive: true });
  await fs.mkdir(testOutputDir, { recursive: true });
  run.artifact({ type: "maestro_debug_dir", path: debugOutput, mime: "application/vnd.directory" });
  run.artifact({ type: "maestro_test_output_dir", path: testOutputDir, mime: "application/vnd.directory" });

  const env = parseEnvList(values.env ?? []);

  let deviceId: string;
  let targetDevice: ResultEnvelope["target"]["device"] = null;

  if (platform === "ios") {
    const selector = values.device?.trim() || "booted";
    const device = await resolveIOSDeviceSelector(selector);
    if (values.app) {
      await simctlBoot(device.udid);
      await simctlBootStatus(device.udid);
      const appPath = path.resolve(values.app);
      const res = await run.execLogged("simctl", "install", "xcrun", ["simctl", "install", device.udid, appPath], { timeoutMs: 120000 });
      if (!res.ok) throw new Error(`simctl install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    }
    deviceId = device.udid;
    targetDevice = { platform: "ios", id: device.udid, name: device.name };
  } else {
    const device = await resolveAndroidDevice(values.device);
    if (values.app) {
      const appPath = path.resolve(values.app);
      const res = await run.execLogged("adb", "install", "adb", ["-s", device.id, "install", "-r", appPath], { timeoutMs: 120000 });
      if (!res.ok) throw new Error(`adb install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
    }
    deviceId = device.id;
    targetDevice = { platform: "android", id: device.id, name: null };
  }

  const maestroArgs: string[] = ["--device", deviceId, "test"];
  if (fmt !== "noop") maestroArgs.push("--format", fmt, "--output", outputPath!);
  maestroArgs.push("--test-output-dir", testOutputDir);
  maestroArgs.push("--debug-output", debugOutput);
  if (values["no-reinstall-driver"]) maestroArgs.push("--no-reinstall-driver");
  maestroArgs.push(flowPath);

  const res = await run.execLogged("maestro", "test", "maestro", maestroArgs, { env, timeoutMs: 60 * 60 * 1000 });

  const ok = res.ok;
  const envelope = createEnvelope({
    ok,
    command_name: "flow.run",
    command_argv: ["flow", "run", ...argv],
    session: sessionName,
    platform,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: runDir,
    target: { device: targetDevice, app: { app_id: appId, app_path: values.app ? path.resolve(values.app) : null } },
    artifacts: run.artifacts,
    data: {
      ok,
      device: targetDevice,
      flow: flowPath,
      report: outputPath,
      command: ["maestro", ...maestroArgs].join(" "),
    },
    error: ok ? null : { code: "PROCESS_FAILED", message: "flow failed", details: [`code=${res.code ?? "unknown"}`] },
    next_steps: ok
      ? [{ label: "Capture a UI snapshot", argv: ["ui", "snapshot", "-i"] }]
      : [{ label: "Retry", argv: ["flow", "run", ...argv] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([ok ? "Maestro run succeeded." : `Maestro run failed (code=${res.code}).`, `Flow: ${flowPath}`, `Run: ${runDir}`]);
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}
