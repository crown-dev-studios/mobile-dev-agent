import { parseArgs } from "node:util";
import { printHuman, printJSON } from "../lib/format.js";
import { flattenIOSDevices, simctlListDevicesJSON, type IOSDevice } from "../lib/simctl.js";
import { adbListDevices, type AndroidDevice } from "../lib/android.js";

type DevicesArgs = {
  platform?: string;
  json?: boolean;
};

export async function cmdDevicesList(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: "ios" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: DevicesArgs };

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android", "all"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios, android, or all)`);
  }

  let iosDevices: IOSDevice[] = [];
  let androidDevices: AndroidDevice[] = [];
  if (platform === "ios" || platform === "all") {
    const raw = await simctlListDevicesJSON();
    iosDevices = flattenIOSDevices(raw).filter((d) => d.isAvailable);
  }
  if (platform === "android" || platform === "all") {
    androidDevices = await adbListDevices();
  }

  if (values.json) {
    printJSON({ iosDevices, androidDevices });
    return;
  }

  const lines = [];
  if (platform === "ios" || platform === "all") {
    lines.push("iOS Simulators:");
    for (const d of iosDevices) {
      lines.push(`${d.state === "Booted" ? "*" : " "} ${d.name}  ${d.udid}  (${d.runtime})`);
    }
    if (!iosDevices.length) lines.push("  (none)");
  }
  if (platform === "android" || platform === "all") {
    if (lines.length) lines.push("");
    lines.push("Android Devices:");
    for (const d of androidDevices) {
      const state = d.state === "device" ? "*" : " ";
      lines.push(`${state} ${d.id}  ${d.state}${d.model ? `  (${d.model})` : ""}`);
    }
    if (!androidDevices.length) lines.push("  (none)");
  }
  printHuman(lines.length ? lines : ["No devices found."]);
}
