import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

export async function resolveAxePath(): Promise<string> {
  const override = process.env.MOBILE_DEV_AGENT_AXE_PATH;
  if (override) {
    const abs = path.resolve(override);
    if (await fileExists(abs)) return abs;
  }

  // Prefer a bundled binary if present.
  // Repo/package layout: <root>/bundled/axe
  const bundled = path.resolve(fileURLToPath(new URL("../../../bundled/axe", import.meta.url)));
  if (await fileExists(bundled)) return bundled;

  // Fallback to PATH.
  return "axe";
}
