import { parseArgs } from "node:util";
import { printHuman, printJSON } from "../lib/format.js";
import { resolveIOSSimulator, simctlBoot, simctlBootStatus } from "../lib/simctl.js";
import {
  adbListDevices,
  adbWaitForDevice,
  startEmulator,
  waitForBootCompleted,
  waitForEmulator,
  type AndroidDevice,
} from "../lib/android.js";

type DeviceBootArgs = {
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  avd?: string;
  wait?: boolean;
  headless?: boolean;
  json?: boolean;
};

export async function cmdDeviceBoot(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: "ios" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      avd: { type: "string" },
      wait: { type: "boolean", default: true },
      headless: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: DeviceBootArgs };

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }
  const platformKey = platform as "ios" | "android";

  if (platformKey === "ios") {
    const iosUdid = values.udid || (values.device && !values.name ? values.device : undefined);
    if (!iosUdid && !values.name) {
      throw new Error("device boot requires --udid or --name for iOS");
    }

    const chosen = await resolveIOSSimulator({ udid: iosUdid, name: values.name, bootIfNeeded: false });
    await simctlBoot(chosen.udid);
    if (values.wait) {
      await simctlBootStatus(chosen.udid);
    }

    const result = { ok: true, platform: "ios", device: { ...chosen, state: "Booted" } };
    if (values.json) {
      printJSON(result);
      return;
    }
    printHuman([`Booted: ${chosen.name} (${chosen.udid})`]);
    return;
  }

  if (!values.avd && !values.device) {
    throw new Error("device boot requires --avd <name> or --device <id> for Android");
  }

  const initialDevices = values.avd && !values.device ? await adbListDevices() : [];
  let bootedEmulatorId: string | null = null;
  if (values.avd) {
    startEmulator(values.avd, { headless: values.headless });
  }
  if (values.wait) {
    if (values.device) {
      await adbWaitForDevice(values.device);
      await waitForBootCompleted(values.device);
    } else {
      const emulator = await waitForEmulator({ existingIds: initialDevices.map((d) => d.id) });
      if (!emulator) {
        throw new Error("No Android emulator detected after boot.");
      }
      bootedEmulatorId = emulator.id;
      await adbWaitForDevice(emulator.id);
      await waitForBootCompleted(emulator.id);
    }
  }

  const devices = await adbListDevices();
  let chosen: AndroidDevice | null = null;
  if (values.device) {
    chosen = devices.find((d) => d.id === values.device) ?? null;
  } else if (values.avd) {
    const emulators = devices.filter((d) => d.type === "emulator");
    if (bootedEmulatorId) {
      chosen = devices.find((d) => d.id === bootedEmulatorId) ?? null;
    }
    if (!chosen) {
      chosen = emulators.find((d) => d.state === "device") ?? emulators[0] ?? null;
    }
  }
  if (!chosen) {
    throw new Error(values.avd ? "No Android emulator detected after boot." : "No Android device detected after boot.");
  }

  const result = { ok: true, platform: "android", device: chosen };
  if (values.json) {
    printJSON(result);
    return;
  }
  printHuman([`Ready: ${chosen.id} (${chosen.state})`]);
}
