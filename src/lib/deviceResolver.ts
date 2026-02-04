import { adbListDevices, type AndroidDevice } from "./android.js";
import {
  flattenIOSDevices,
  pickDeviceByName,
  pickDeviceByUdid,
  pickFirstAvailableIOSDevice,
  pickFirstBootedIOSDevice,
  pickLatestIOSDevice,
  simctlListDevicesJSON,
  type IOSDevice,
} from "./simctl.js";
import { usageError } from "./cliError.js";

export type Platform = "ios" | "android";

export async function resolveIOSDeviceSelector(selector: string): Promise<IOSDevice> {
  const json = await simctlListDevicesJSON();
  const devices = flattenIOSDevices(json).filter((d) => d.isAvailable);

  const key = selector.trim();
  if (!key) throw usageError("Empty --device selector");

  const lower = key.toLowerCase();
  let chosen: IOSDevice | null = null;

  if (lower === "booted") {
    chosen = pickFirstBootedIOSDevice(devices);
  } else if (lower === "available") {
    chosen = pickFirstAvailableIOSDevice(devices);
  } else if (lower === "iphone-latest" || lower === "iphone" || lower === "latest" || lower === "ios-latest") {
    chosen = pickLatestIOSDevice(devices, "iphone");
  } else if (lower === "ipad-latest" || lower === "ipad") {
    chosen = pickLatestIOSDevice(devices, "ipad");
  } else {
    chosen = pickDeviceByUdid(devices, key) ?? pickDeviceByName(devices, key);
  }

  if (!chosen) throw usageError(`No iOS Simulator matches "${selector}".`);
  return chosen;
}

export async function resolveAndroidDeviceSelector(selector: string): Promise<AndroidDevice | null> {
  const devices = await adbListDevices();
  const key = selector.trim();
  if (!key) throw usageError("Empty --device selector");
  return devices.find((d) => d.id === key) ?? null;
}

export async function resolveAndroidDeviceDefault(): Promise<AndroidDevice> {
  const devices = await adbListDevices();
  const chosen = devices.find((d) => d.state === "device") ?? devices[0];
  if (!chosen) throw usageError("No Android devices detected. Pass --device <id>.");
  return chosen;
}

export async function resolveAndroidDevice(selector?: string | null): Promise<AndroidDevice> {
  const key = selector?.trim() || "";
  if (!key) return await resolveAndroidDeviceDefault();
  const chosen = await resolveAndroidDeviceSelector(key);
  if (!chosen) throw usageError(`No Android device matches "${key}".`);
  return chosen;
}
