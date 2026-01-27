import { spawn } from "node:child_process";
import fs from "node:fs";
import { execFile } from "./exec.js";

export type AndroidDevice = {
  id: string;
  state: string;
  details: string;
  model?: string;
  device?: string;
  transportId?: string;
  type: "emulator" | "device";
  meta: Record<string, string>;
};

export function parseAdbDevices(output: string): AndroidDevice[] {
  const lines = (output || "").split(/\r?\n/).map((l) => l.trim());
  const devices: AndroidDevice[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("List of devices")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [id, state, ...rest] = parts;
    const meta: Record<string, string> = {};
    for (const token of rest) {
      const idx = token.indexOf(":");
      if (idx !== -1) {
        const key = token.slice(0, idx);
        const value = token.slice(idx + 1);
        meta[key] = value;
      }
    }
    devices.push({
      id,
      state,
      details: rest.join(" "),
      model: meta.model,
      device: meta.device,
      transportId: meta.transport_id ?? meta.transportId,
      type: id.startsWith("emulator-") ? "emulator" : "device",
      meta,
    });
  }
  return devices;
}

export async function adbListDevices(): Promise<AndroidDevice[]> {
  const res = await execFile("adb", ["devices", "-l"]);
  if (!res.ok) {
    throw new Error(`adb devices failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
  return parseAdbDevices(res.stdout);
}

export async function adbWaitForDevice(serial: string | undefined, timeoutMs = 120000): Promise<void> {
  const args = serial ? ["-s", serial, "wait-for-device"] : ["wait-for-device"];
  const res = await execFile("adb", args, { timeoutMs });
  if (!res.ok) {
    throw new Error(`adb wait-for-device failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function waitForEmulator({
  existingIds = [],
  timeoutMs = 120000,
  pollIntervalMs = 2000,
}: {
  existingIds?: string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
} = {}): Promise<AndroidDevice | null> {
  const started = Date.now();
  const existing = new Set(existingIds);
  let lastEmulator: AndroidDevice | null = null;

  while (Date.now() - started < timeoutMs) {
    const devices = await adbListDevices();
    const emulators = devices.filter((d) => d.type === "emulator");
    if (emulators.length > 0) {
      const newEmulator = emulators.find((d) => !existing.has(d.id));
      if (newEmulator) return newEmulator;
      lastEmulator = emulators[0];
      if (existing.size === 0) return emulators[0];
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return lastEmulator;
}

export async function adbGetProp(serial: string | undefined, prop: string): Promise<string> {
  const args = serial ? ["-s", serial, "shell", "getprop", prop] : ["shell", "getprop", prop];
  const res = await execFile("adb", args);
  if (!res.ok) {
    throw new Error(`adb getprop failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
  return (res.stdout || "").trim();
}

export async function waitForBootCompleted(serial: string, timeoutMs = 180000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const val = await adbGetProp(serial, "sys.boot_completed");
      if (val === "1") return;
    } catch {
      // ignore transient failures while device is booting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Android emulator boot timed out.");
}

export function startEmulator(avdName: string, { headless = false }: { headless?: boolean } = {}): void {
  const args = ["-avd", avdName];
  if (headless) {
    args.push("-no-window", "-no-audio");
  }
  const child = spawn("emulator", args, { detached: true, stdio: "ignore" });
  child.unref();
}

export async function adbInstallApk(serial: string, apkPath: string): Promise<void> {
  const args = serial ? ["-s", serial, "install", "-r", apkPath] : ["install", "-r", apkPath];
  const res = await execFile("adb", args);
  if (!res.ok) {
    throw new Error(`adb install failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
}

export async function adbScreenshot(serial: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = serial ? ["-s", serial, "exec-out", "screencap", "-p"] : ["exec-out", "screencap", "-p"];
    const child = spawn("adb", args, { stdio: ["ignore", "pipe", "pipe"] });
    const file = fs.createWriteStream(outPath);
    let stderr = "";

    child.stdout.pipe(file);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      stderr += d;
    });

    child.on("error", (err) => {
      file.end();
      reject(err);
    });
    child.on("close", (code) => {
      file.end();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`adb screencap failed (code=${code}): ${stderr}`.trim()));
      }
    });
  });
}
