import { execFile } from "./exec.js";

export type SimctlDevice = {
  name: string;
  udid: string;
  state: string;
  isAvailable: boolean;
};

export type SimctlDevicesJSON = {
  devices: Record<string, SimctlDevice[]>;
};

export type IOSDevice = {
  name: string;
  udid: string;
  state: string;
  isAvailable: boolean;
  runtime: string;
};

export async function simctlListDevicesJSON(): Promise<SimctlDevicesJSON> {
  const res = await execFile("xcrun", ["simctl", "list", "devices", "--json"], { timeoutMs: 30000 });
  if (!res.ok) {
    throw new Error(`simctl list devices failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
  return JSON.parse(res.stdout) as SimctlDevicesJSON;
}

export function flattenIOSDevices(simctlJSON: SimctlDevicesJSON): IOSDevice[] {
  const devicesByRuntime = simctlJSON?.devices ?? {};
  const out: IOSDevice[] = [];
  for (const [runtime, devices] of Object.entries(devicesByRuntime) as [string, SimctlDevice[]][]) {
    if (!runtime.includes("iOS")) continue;
    for (const d of devices) {
      out.push({
        name: d.name,
        udid: d.udid,
        state: d.state,
        isAvailable: Boolean(d.isAvailable),
        runtime,
      });
    }
  }
  return out;
}

export function pickDeviceByName(devices: IOSDevice[], name: string): IOSDevice | null {
  const target = name.trim().toLowerCase();
  return devices.find((d) => d.name?.toLowerCase() === target) ?? null;
}

export function pickDeviceByUdid(devices: IOSDevice[], udid: string): IOSDevice | null {
  const target = udid.trim().toLowerCase();
  return devices.find((d) => d.udid?.toLowerCase() === target) ?? null;
}

export function pickFirstBootedIOSDevice(devices: IOSDevice[]): IOSDevice | null {
  return devices.find((d) => d.isAvailable && d.state === "Booted") ?? null;
}

export function pickFirstAvailableIOSDevice(devices: IOSDevice[]): IOSDevice | null {
  return devices.find((d) => d.isAvailable) ?? null;
}

function parseRuntimeVersion(runtime: string): number[] {
  const match = runtime.match(/iOS-(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function compareRuntime(a: string, b: string): number {
  const av = parseRuntimeVersion(a);
  const bv = parseRuntimeVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return 0;
}

function deviceNameScore(name: string): number {
  const numberMatches = name.match(/\d+/g);
  const model = numberMatches ? Number(numberMatches[numberMatches.length - 1]) : 0;
  const lower = name.toLowerCase();
  const variant =
    lower.includes("pro max") ? 3 : lower.includes("pro") ? 2 : lower.includes("plus") ? 1 : 0;
  return model * 10 + variant;
}

export function pickLatestIOSDevice(devices: IOSDevice[], family?: "iphone" | "ipad"): IOSDevice | null {
  const filtered = devices.filter((d) => {
    if (!d.isAvailable) return false;
    if (!family) return true;
    return family === "iphone" ? d.name.startsWith("iPhone") : d.name.startsWith("iPad");
  });
  if (!filtered.length) return null;
  return filtered.sort((a, b) => {
    const runtimeDiff = compareRuntime(a.runtime, b.runtime);
    if (runtimeDiff !== 0) return runtimeDiff;
    const scoreDiff = deviceNameScore(b.name) - deviceNameScore(a.name);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  })[0];
}

function looksLikeDestination(value: string): boolean {
  return /\b(platform|name|udid|OS)=/i.test(value);
}

export async function resolveIOSDestination(
  input?: string
): Promise<{ destination: string; device?: IOSDevice }> {
  const trimmed = input?.trim();
  if (trimmed && looksLikeDestination(trimmed)) {
    return { destination: trimmed };
  }

  const json = await simctlListDevicesJSON();
  const devices = flattenIOSDevices(json).filter((d) => d.isAvailable);
  const key = (trimmed || "iphone-latest").toLowerCase();

  let chosen: IOSDevice | null = null;
  if (key === "booted") {
    chosen = pickFirstBootedIOSDevice(devices);
  } else if (key === "available") {
    chosen = pickFirstAvailableIOSDevice(devices);
  } else if (key === "iphone" || key === "iphone-latest" || key === "latest" || key === "ios-latest") {
    chosen = pickLatestIOSDevice(devices, "iphone");
  } else if (key === "ipad" || key === "ipad-latest") {
    chosen = pickLatestIOSDevice(devices, "ipad");
  } else {
    chosen = pickDeviceByUdid(devices, key) ?? pickDeviceByName(devices, key);
  }

  if (!chosen) {
    throw new Error(`No iOS Simulator matches "${trimmed ?? "iphone-latest"}".`);
  }

  return {
    destination: `platform=iOS Simulator,name=${chosen.name}`,
    device: chosen,
  };
}

export async function simctlBoot(udid: string): Promise<void> {
  // `simctl boot` exits non-zero if already booted in some configurations. Use bootstatus for the wait.
  await execFile("xcrun", ["simctl", "boot", udid]);
}

export async function simctlBootStatus(udid: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "bootstatus", udid, "-b"], { timeoutMs: 120000 });
  if (!res.ok) {
    throw new Error(`simctl bootstatus failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlInstallApp(udid: string, appPath: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "install", udid, appPath]);
  if (!res.ok) {
    throw new Error(`simctl install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlScreenshot(udid: string, outPath: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "io", udid, "screenshot", outPath]);
  if (!res.ok) {
    throw new Error(`simctl screenshot failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlShutdown(udid: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "shutdown", udid]);
  if (!res.ok) {
    throw new Error(`simctl shutdown failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlErase(udid: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "erase", udid]);
  if (!res.ok) {
    throw new Error(`simctl erase failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlUninstallApp(udid: string, appId: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "uninstall", udid, appId]);
  if (!res.ok) {
    throw new Error(`simctl uninstall failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlLaunchApp(udid: string, appId: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "launch", udid, appId]);
  if (!res.ok) {
    throw new Error(`simctl launch failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function simctlTerminateApp(udid: string, appId: string): Promise<void> {
  const res = await execFile("xcrun", ["simctl", "terminate", udid, appId]);
  if (!res.ok) {
    throw new Error(`simctl terminate failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function resolveIOSSimulator({
  udid,
  name,
  bootIfNeeded,
}: {
  udid?: string;
  name?: string;
  bootIfNeeded?: boolean;
}): Promise<IOSDevice> {
  const json = await simctlListDevicesJSON();
  const devices = flattenIOSDevices(json);

  let chosen: IOSDevice | null = null;
  if (udid) {
    chosen = devices.find((d) => d.udid === udid) ?? null;
    if (!chosen) {
      throw new Error(`No iOS Simulator found with udid: ${udid}`);
    }
  } else if (name) {
    chosen = pickDeviceByName(devices, name);
    if (!chosen) {
      throw new Error(`No iOS Simulator found with name: ${name}`);
    }
  } else {
    chosen = pickFirstBootedIOSDevice(devices) ?? null;
    if (!chosen && bootIfNeeded) {
      chosen = pickFirstAvailableIOSDevice(devices) ?? null;
    }
    if (!chosen) {
      throw new Error("No booted iOS Simulator found. Pass --boot or specify --udid/--name.");
    }
  }

  if (bootIfNeeded && chosen.state !== "Booted") {
    await simctlBoot(chosen.udid);
    await simctlBootStatus(chosen.udid);
    chosen = { ...chosen, state: "Booted" };
  }

  return chosen;
}
