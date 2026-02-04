import fs from "node:fs/promises";
import path from "node:path";
import { getCacheDir } from "./dirs.js";

export type RunInfo = {
  dir: string;
  startedAt: Date;
  startedAtSource: "name" | "mtime";
  mtimeMs: number;
  ok: boolean | null; // null = unknown
  sizeBytes: number;
};

export type GCPlan = {
  keepLast: number;
  keepFailureDays: number;
  maxBytes: number;
  totalRuns: number;
  totalBytes: number;
  keep: RunInfo[];
  delete: RunInfo[];
  afterBytes: number;
};

function parseStartedAtFromDirName(dirName: string): Date | null {
  // <YYYYMMDD-HHMMSS>-<rand>
  const m = dirName.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

async function dirSizeBytes(dirPath: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dirPath, e.name);
    if (e.isDirectory()) {
      total += await dirSizeBytes(p);
    } else if (e.isFile()) {
      const st = await fs.stat(p).catch(() => null);
      if (st) total += st.size;
    }
  }
  return total;
}

async function readRunOk(runDir: string): Promise<boolean | null> {
  const p = path.join(runDir, "result.json");
  const raw = await fs.readFile(p, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown };
    if (typeof parsed.ok === "boolean") return parsed.ok;
    return null;
  } catch {
    return null;
  }
}

export async function listRuns(rootDir: string): Promise<RunInfo[]> {
  const runsRoot = path.join(rootDir, "runs");
  const entries = await fs.readdir(runsRoot, { withFileTypes: true }).catch(() => []);

  const out: RunInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(runsRoot, e.name);
    const fromName = parseStartedAtFromDirName(e.name);
    const st = await fs.stat(dir).catch(() => null);
    const startedAt = fromName ?? (st ? st.mtime : new Date(0));
    const startedAtSource = fromName ? "name" : "mtime";
    const mtimeMs = st ? st.mtimeMs : 0;
    const ok = await readRunOk(dir);
    const sizeBytes = await dirSizeBytes(dir);
    out.push({ dir, startedAt, startedAtSource, mtimeMs, ok, sizeBytes });
  }

  return out.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export async function planGC({
  keepLast,
  keepFailureDays,
  maxBytes,
}: {
  keepLast: number;
  keepFailureDays: number;
  maxBytes: number;
}): Promise<GCPlan> {
  const root = getCacheDir();
  const runs = await listRuns(root);
  const totalBytes = runs.reduce((acc, r) => acc + r.sizeBytes, 0);
  const keepSet = new Set<string>();

  for (const r of runs.slice(0, keepLast)) keepSet.add(r.dir);

  const now = Date.now();
  const keepFailureMs = keepFailureDays * 24 * 60 * 60 * 1000;
  for (const r of runs) {
    const isFailure = r.ok === false || r.ok === null;
    if (!isFailure) continue;
    const ageMs = now - r.startedAt.getTime();
    if (ageMs <= keepFailureMs) keepSet.add(r.dir);
  }

  const keep = runs.filter((r) => keepSet.has(r.dir));
  const deletable = runs.filter((r) => !keepSet.has(r.dir));

  const deletePlan: RunInfo[] = [];
  let afterBytes = totalBytes;

  const deleteOldestFirst = (candidates: RunInfo[]) => {
    const sorted = [...candidates].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    for (const r of sorted) {
      if (afterBytes <= maxBytes) break;
      deletePlan.push(r);
      afterBytes -= r.sizeBytes;
    }
  };

  deleteOldestFirst(deletable);

  // If still over budget, start deleting from the kept set, oldest first.
  if (afterBytes > maxBytes) {
    const remainingKeep = keep.filter((r) => !deletePlan.some((d) => d.dir === r.dir));
    deleteOldestFirst(remainingKeep);
  }

  const keepAfter = runs.filter((r) => !deletePlan.some((d) => d.dir === r.dir));

  return {
    keepLast,
    keepFailureDays,
    maxBytes,
    totalRuns: runs.length,
    totalBytes,
    keep: keepAfter,
    delete: deletePlan,
    afterBytes,
  };
}

export async function executeGC(plan: GCPlan, { dryRun }: { dryRun: boolean }): Promise<void> {
  if (dryRun) return;
  for (const r of plan.delete) {
    const st = await fs.stat(r.dir).catch(() => null);
    if (!st) continue;
    if (r.mtimeMs && st.mtimeMs !== r.mtimeMs) continue;
    await fs.rm(r.dir, { recursive: true, force: true });
  }
}
