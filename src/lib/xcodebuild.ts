import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { execFile } from "./exec.js";

export type BuildXcodebuildArgsOptions = {
  project?: string;
  workspace?: string;
  scheme: string;
  configuration?: string;
  destination?: string;
  derivedData?: string;
};

export function buildXcodebuildArgs({
  project,
  workspace,
  scheme,
  configuration,
  destination,
  derivedData,
}: BuildXcodebuildArgsOptions): string[] {
  const args = [];
  if (project) args.push("-project", project);
  if (workspace) args.push("-workspace", workspace);
  args.push("-scheme", scheme);
  args.push("-sdk", "iphonesimulator");
  if (configuration) args.push("-configuration", configuration);
  if (destination) args.push("-destination", destination);
  if (derivedData) args.push("-derivedDataPath", derivedData);
  args.push("build");
  return args;
}

export async function runXcodebuild(
  args: string[],
  { stream }: { stream?: boolean | "stderr" } = {}
): Promise<void> {
  const res = await execFile("xcodebuild", args, { stream: stream ? stream : false });
  if (!res.ok) {
    throw new Error(`xcodebuild failed (code=${res.code}).`);
  }
}

async function listAppsInProductsDir(productsDir: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(productsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory() && e.name.endsWith(".app"))
    .map((e) => path.join(productsDir, e.name));
}

export async function findBuiltApps({
  derivedData,
  configuration,
}: {
  derivedData: string;
  configuration?: string;
}): Promise<string[]> {
  const config = configuration || "Debug";
  const productsRoot = path.join(derivedData, "Build", "Products");
  const candidateDirs = [
    path.join(productsRoot, `${config}-iphonesimulator`),
    path.join(productsRoot, `${config} (iOS Simulator)`),
  ];

  const apps = [];
  for (const dir of candidateDirs) {
    const found = await listAppsInProductsDir(dir);
    for (const a of found) apps.push(a);
  }
  return apps;
}

export function pickSingleApp(
  apps: string[],
  { scheme }: { scheme?: string } = {}
): { ok: boolean; appPath?: string; reason?: string } {
  if (apps.length === 0) return { ok: false, reason: "No .app bundles found in DerivedData." };
  if (apps.length === 1) return { ok: true, appPath: apps[0] };

  if (scheme) {
    const wanted = `${scheme}.app`;
    const match = apps.find((p) => p.endsWith(path.sep + wanted));
    if (match) return { ok: true, appPath: match };
  }

  return { ok: false, reason: `Multiple .app bundles found: ${apps.join(", ")}` };
}
