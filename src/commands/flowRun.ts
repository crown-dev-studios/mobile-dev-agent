import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFile } from "../lib/exec.js";
import { printHuman, printJSON } from "../lib/format.js";
import { parseEnvList } from "../lib/env.js";
import { buildMaestroTestArgs } from "../lib/maestro.js";
import { assertIOSAppBundle } from "../lib/appBundle.js";
import { resolveIOSSimulator, simctlInstallApp, type IOSDevice } from "../lib/simctl.js";
import { adbInstallApk, adbListDevices } from "../lib/android.js";
import { defaultOutputRoot, ensureDir } from "../lib/paths.js";

function readStdin() {
  if (process.stdin.isTTY) return null;
  const data = readFileSync(0, "utf8");
  return data && data.trim() ? data : null;
}

type FlowRunArgs = {
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  "app-id"?: string;
  app?: string;
  flow?: string;
  "out-dir"?: string;
  "test-output-dir"?: string;
  "debug-output"?: string;
  format?: string;
  output?: string;
  env?: string[];
  json?: boolean;
  verbose?: boolean;
};

export async function cmdFlowRun(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: "ios" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      "app-id": { type: "string" },
      app: { type: "string" },
      flow: { type: "string" },
      "out-dir": { type: "string" },
      "test-output-dir": { type: "string" },
      "debug-output": { type: "string" },
      format: { type: "string", default: "" },
      output: { type: "string", default: "" },
      env: { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: FlowRunArgs };

  const stdinSteps = readStdin();
  if (stdinSteps && values.flow) {
    throw new Error("Provide either stdin steps OR --flow, not both.");
  }
  if (!stdinSteps && !values.flow) {
    throw new Error("Provide steps via stdin or pass --flow <path>.");
  }

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }
  const platformKey = platform as "ios" | "android";

  const outDir = values["out-dir"] ? path.resolve(values["out-dir"]) : defaultOutputRoot("mobile-dev-agent");
  await ensureDir(outDir);

  const testOutputDir = values["test-output-dir"]
    ? path.resolve(values["test-output-dir"])
    : path.join(outDir, "test-output");
  const debugOutputDir = values["debug-output"] ? path.resolve(values["debug-output"]) : path.join(outDir, "debug-output");
  await ensureDir(testOutputDir);
  await ensureDir(debugOutputDir);

  const fmt = values.format?.trim().toLowerCase();
  const formatArg = fmt && fmt !== "noop" ? fmt : undefined;
  let reportPath = values.output?.trim() || "";
  if (fmt && fmt !== "noop") {
    if (!reportPath) {
      reportPath = path.join(outDir, fmt === "junit" ? "report.xml" : "report.html");
    }
  } else {
    reportPath = "";
  }

  let flowPath = values.flow ? path.resolve(values.flow) : null;
  if (!flowPath) {
    flowPath = path.join(outDir, "flow.yaml");
    if (!stdinSteps) {
      throw new Error("Provide steps via stdin or pass --flow <path>.");
    }
    const header = values["app-id"] ? `appId: ${values["app-id"]}\n---\n` : "";
    const content = `${header}${stdinSteps.trim()}\n`;
    await fs.writeFile(flowPath, content, "utf8");
  }

  const env: Record<string, string> = parseEnvList(values.env ?? []);

  let deviceId: string;
  let deviceInfo: IOSDevice | { id: string };

  if (platformKey === "ios") {
    const iosUdid = values.udid || (values.device && !values.name ? values.device : undefined);
    const device = await resolveIOSSimulator({
      udid: iosUdid,
      name: values.name,
      bootIfNeeded: Boolean(values.app),
    });
    deviceId = device.udid;
    deviceInfo = device;
    if (values.app) {
      const stat = await fs.stat(values.app).catch(() => null);
      await assertIOSAppBundle(values.app, stat);
      await simctlInstallApp(device.udid, values.app);
    }
  } else {
    if (!values.device) {
      const devices = await adbListDevices();
      const chosen = devices.find((d) => d.state === "device") ?? devices[0];
      if (!chosen) {
        throw new Error("No Android devices detected. Pass --device <id>.");
      }
      deviceId = chosen.id;
    } else {
      deviceId = values.device;
    }
    deviceInfo = { id: deviceId };
    if (values.app) {
      const stat = await fs.stat(values.app).catch(() => null);
      if (!stat || !stat.isFile() || !values.app.endsWith(".apk")) {
        throw new Error(`--app must point to a .apk for Android. Got: ${values.app}`);
      }
      await adbInstallApk(deviceId, values.app);
    }
  }

  const args = buildMaestroTestArgs({
    flowPath,
    device: deviceId,
    format: formatArg,
    output: reportPath || undefined,
    testOutputDir,
    debugOutput: debugOutputDir,
  });

  const stream = values.verbose ? (values.json ? "stderr" : true) : false;
  const res = await execFile("maestro", args, { env, stream });

  let stdoutPath = null;
  let stderrPath = null;
  if (!values.verbose) {
    stdoutPath = path.join(outDir, "maestro.stdout.txt");
    stderrPath = path.join(outDir, "maestro.stderr.txt");
    if (res.stdout) await fs.writeFile(stdoutPath, res.stdout, "utf8");
    if (res.stderr) await fs.writeFile(stderrPath, res.stderr, "utf8");
  }

  const result = {
    ok: res.ok,
    exit_code: res.code,
    platform,
    device: deviceInfo,
    flow: flowPath,
    command: ["maestro", ...args].join(" "),
    out_dir: outDir,
    test_output_dir: testOutputDir,
    debug_output: debugOutputDir,
    report: reportPath || null,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
  };

  if (values.json) {
    printJSON(result);
    process.exitCode = res.ok ? 0 : res.code ?? 1;
    return;
  }
  const lines = [];
  lines.push(result.ok ? "Maestro run succeeded." : `Maestro run failed (code=${result.exit_code}).`);
  lines.push(`Flow: ${flowPath}`);
  if (platformKey === "ios") {
    const iosDevice = deviceInfo as IOSDevice;
    lines.push(`Device: ${iosDevice.name} (${iosDevice.udid})`);
  } else {
    lines.push(`Device: ${deviceId}`);
  }
  lines.push(`Output: ${outDir}`);
  if (reportPath) lines.push(`Report: ${reportPath}`);
  printHuman(lines);
  process.exitCode = res.ok ? 0 : res.code ?? 1;
}
