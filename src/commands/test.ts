import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import { execFile } from "../lib/exec.js";
import { printHuman, printJSON } from "../lib/format.js";
import { parseEnvList } from "../lib/env.js";
import { assertIOSAppBundle } from "../lib/appBundle.js";
import { resolveIOSSimulator, simctlInstallApp, type IOSDevice } from "../lib/simctl.js";
import { buildMaestroTestArgs } from "../lib/maestro.js";
import { adbInstallApk, adbListDevices } from "../lib/android.js";

type TestArgs = {
  flow?: string;
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  boot?: boolean;
  app?: string;
  format?: string;
  output?: string;
  "maestro-output-dir"?: string;
  "test-output-dir"?: string;
  "debug-output"?: string;
  env?: string[];
  json?: boolean;
  verbose?: boolean;
};

export async function cmdTest(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      flow: { type: "string" },
      platform: { type: "string", default: "ios" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      boot: { type: "boolean", default: false },
      app: { type: "string" },
      format: { type: "string", default: "" },
      output: { type: "string", default: "" },
      "maestro-output-dir": { type: "string", default: "" },
      "test-output-dir": { type: "string", default: "" },
      "debug-output": { type: "string", default: "" },
      env: { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: TestArgs };

  const flowPath = values.flow;
  if (!flowPath) {
    throw new Error("test requires --flow <path-to-flow.yaml|dir>");
  }

  const flowStat = await fs.stat(flowPath).catch(() => null);
  if (!flowStat) {
    throw new Error(`Flow path does not exist: ${flowPath}`);
  }

  const env: Record<string, string> = parseEnvList(values.env ?? []);
  if (values["maestro-output-dir"]) {
    env.MAESTRO_OUTPUT_DIRECTORY = values["maestro-output-dir"];
  }

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }
  const platformKey = platform as "ios" | "android";

  let deviceId: string;
  let deviceInfo: IOSDevice | { id: string };

  if (platformKey === "ios") {
    const iosUdid = values.udid || (values.device && !values.name ? values.device : undefined);
    const device = await resolveIOSSimulator({
      udid: iosUdid,
      name: values.name,
      bootIfNeeded: values.boot || Boolean(values.app),
    });
    deviceId = device.udid;
    deviceInfo = device;

    if (values.app) {
      await assertIOSAppBundle(values.app);
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
      const appStat = await fs.stat(values.app).catch(() => null);
      if (!appStat || !appStat.isFile() || !values.app.endsWith(".apk")) {
        throw new Error(`--app must point to a .apk for Android. Got: ${values.app}`);
      }
      await adbInstallApk(deviceId, values.app);
    }
  }

  const fmt = values.format?.trim().toLowerCase();
  const formatArg = fmt && fmt !== "noop" ? fmt : undefined;

  const args = buildMaestroTestArgs({
    flowPath,
    device: deviceId,
    format: formatArg,
    output: values.output?.trim() || undefined,
    testOutputDir: values["test-output-dir"]?.trim() || undefined,
    debugOutput: values["debug-output"]?.trim() || undefined,
  });

  const stream = values.verbose ? (values.json ? "stderr" : true) : false;
  const res = await execFile("maestro", args, { env, stream });
  const result = {
    ok: res.ok,
    code: res.code,
    device: deviceInfo,
    command: ["maestro", ...args].join(" "),
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };

  if (values.json) {
    printJSON(result);
  } else {
    const lines = [];
    lines.push(result.ok ? "Maestro test succeeded." : `Maestro test failed (code=${result.code}).`);
    if (platformKey === "ios") {
      const iosDevice = deviceInfo as IOSDevice;
      lines.push(`Device: ${iosDevice.name} (${iosDevice.udid})`);
    } else {
      lines.push(`Device: ${deviceId}`);
    }
    if (values.output) lines.push(`Report: ${values.output}`);
    if (values["maestro-output-dir"]) lines.push(`MAESTRO_OUTPUT_DIRECTORY: ${values["maestro-output-dir"]}`);
    if (values["test-output-dir"]) lines.push(`Test Output: ${values["test-output-dir"]}`);
    if (values["debug-output"]) lines.push(`Debug Output: ${values["debug-output"]}`);
    printHuman(lines);
  }

  process.exitCode = result.ok ? 0 : (result.code ?? 1);
}
