import fs from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs";

export async function assertIOSAppBundle(appPath: string, stat?: Stats | null): Promise<void> {
  const current = stat ?? (await fs.stat(appPath).catch(() => null));
  if (!current) {
    throw new Error(`--app path does not exist: ${appPath}`);
  }
  if (!current.isDirectory() || !appPath.endsWith(".app")) {
    throw new Error(`--app must point to a .app bundle directory. Got: ${appPath}`);
  }

  const infoPlist = path.join(appPath, "Info.plist");
  const plistStat = await fs.stat(infoPlist).catch(() => null);
  if (!plistStat || !plistStat.isFile()) {
    throw new Error(`--app is missing Info.plist: ${appPath}`);
  }
}
