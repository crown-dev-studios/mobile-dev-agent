import fs from "node:fs/promises";
import path from "node:path";
import { getCacheDir } from "./dirs.js";

export function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function defaultOutputRoot(kind: string): string {
  // Prefer cache-managed output over project-directory litter.
  return path.join(getCacheDir(), "tmp", kind, timestampSlug());
}

export function safeName(value: unknown): string {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_");
}
