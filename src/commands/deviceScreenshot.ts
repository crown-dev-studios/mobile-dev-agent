import path from "node:path";
import { parseArgs } from "node:util";
import { printHuman, printJSON } from "../lib/format.js";
import { adbScreenshot } from "../lib/android.js";
import { resolveIOSSimulator, simctlScreenshot } from "../lib/simctl.js";
import { defaultOutputRoot, ensureDir, safeName } from "../lib/paths.js";

type DeviceScreenshotArgs = {
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  out?: string;
  json?: boolean;
};

export async function cmdDeviceScreenshot(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: "ios" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: DeviceScreenshotArgs };

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }

  let outPath = values.out;
  if (!outPath) {
    const root = defaultOutputRoot("mobile-dev-agent");
    const dir = path.join(root, "screenshots");
    await ensureDir(dir);
    const suffix =
      platform === "ios" ? safeName(values.udid || values.name || "booted") : safeName(values.device || "device");
    outPath = path.join(dir, `${platform}-${suffix}.png`);
  } else {
    await ensureDir(path.dirname(outPath));
  }

  if (platform === "ios") {
    const iosUdid = values.udid || (values.device && !values.name ? values.device : undefined);
    const device = await resolveIOSSimulator({ udid: iosUdid, name: values.name, bootIfNeeded: false });
    await simctlScreenshot(device.udid, outPath);
    const result = { ok: true, platform: "ios", device, path: outPath };
    if (values.json) {
      printJSON(result);
      return;
    }
    printHuman([`Screenshot saved: ${outPath}`]);
    return;
  }

  const deviceId = values.device;
  if (!deviceId) {
    throw new Error("device screenshot requires --device <id> for Android");
  }
  await adbScreenshot(deviceId, outPath);
  const result = { ok: true, platform: "android", device: { id: deviceId }, path: outPath };
  if (values.json) {
    printJSON(result);
    return;
  }
  printHuman([`Screenshot saved: ${outPath}`]);
}
