import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import { printHuman, printJSON } from "../lib/format.js";
import { assertIOSAppBundle } from "../lib/appBundle.js";
import { resolveIOSSimulator, simctlInstallApp } from "../lib/simctl.js";
import { adbInstallApk, adbListDevices } from "../lib/android.js";

type InstallAppArgs = {
  app?: string;
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  boot?: boolean;
  json?: boolean;
};

export async function cmdInstallApp(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      app: { type: "string" },
      platform: { type: "string", default: "" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      boot: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: InstallAppArgs };

  const appPath = values.app;
  if (!appPath) {
    throw new Error("app install requires --app <path-to-.app>");
  }

  const stat = await fs.stat(appPath).catch(() => null);
  if (!stat) {
    throw new Error(`--app path does not exist: ${appPath}`);
  }

  const inferred = appPath.endsWith(".apk") ? "android" : appPath.endsWith(".app") ? "ios" : "";
  const platform = String(values.platform || inferred || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }
  const platformKey = platform as "ios" | "android";

  if (platformKey === "ios") {
    await assertIOSAppBundle(appPath, stat);
    const iosUdid = values.udid || (values.device && !values.name ? values.device : undefined);
    const device = await resolveIOSSimulator({ udid: iosUdid, name: values.name, bootIfNeeded: values.boot });
    await simctlInstallApp(device.udid, appPath);

    const result = { ok: true, platform: "ios", device, appPath };
    if (values.json) {
      printJSON(result);
      return;
    }
    printHuman([`Installed ${appPath} to ${device.name} (${device.udid})`]);
    return;
  }

  if (!appPath.endsWith(".apk") || !stat.isFile()) {
    throw new Error(`--app must point to a .apk for Android. Got: ${appPath}`);
  }

  let deviceId: string;
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

  await adbInstallApk(deviceId, appPath);
  const result = { ok: true, platform: "android", device: { id: deviceId }, appPath };
  if (values.json) {
    printJSON(result);
    return;
  }
  printHuman([`Installed ${appPath} to ${deviceId}`]);
}
