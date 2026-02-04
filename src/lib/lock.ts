import fs from "node:fs/promises";
import path from "node:path";

export async function withFileLock<T>(
  dir: string,
  name: string,
  fn: () => Promise<T>,
  { timeoutMs = 1500, pollMs = 50 }: { timeoutMs?: number; pollMs?: number } = {}
): Promise<T> {
  const lockPath = path.join(dir, `${name}.lock`);
  const deadline = Date.now() + timeoutMs;
  let handle: fs.FileHandle | null = null;

  while (Date.now() <= deadline) {
    try {
      handle = await fs.open(lockPath, "wx");
      break;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw err;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  if (!handle) {
    // Best-effort: if we can't get the lock quickly, still run rather than hanging.
    return await fn();
  }

  try {
    return await fn();
  } finally {
    await handle.close().catch(() => null);
    await fs.unlink(lockPath).catch(() => null);
  }
}

