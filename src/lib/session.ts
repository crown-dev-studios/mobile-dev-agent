import fs from "node:fs/promises";
import { ensureDir } from "./paths.js";
import { getLastSnapshotPath, getLastTargetPath, getSessionDir, getSessionFilePath } from "./dirs.js";
import { CLIError } from "./cliError.js";
import { atomicWriteFile } from "./fsAtomic.js";
import { withFileLock } from "./lock.js";

export type SessionPlatform = "ios" | "android";

export type SessionDefaults = {
  platform?: SessionPlatform;
  device?: { selector: string };
  app?: { app_id?: string; app_path?: string };
  build?: {
    ios?: {
      project?: string;
      workspace?: string;
      scheme?: string;
      configuration?: string;
      destination?: string;
      derived_data?: string;
    };
  };
  env?: Record<string, string>;
};

export type SessionFile = {
  schema_version: 1;
  defaults: SessionDefaults;
};

function emptySession(): SessionFile {
  return { schema_version: 1, defaults: { env: {} } };
}

function isSessionPlatform(value: string | undefined): value is SessionPlatform {
  return value === "ios" || value === "android";
}

export async function readSession(sessionName: string): Promise<SessionFile> {
  const filePath = getSessionFilePath(sessionName);
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (!raw) return emptySession();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CLIError(`Invalid session.json (not JSON): ${filePath}`, { exitCode: 1 });
  }

  if (!parsed || typeof parsed !== "object") return emptySession();
  const maybe = parsed as Partial<SessionFile>;
  const defaults = (maybe.defaults && typeof maybe.defaults === "object" ? maybe.defaults : {}) as SessionDefaults;
  const out: SessionFile = {
    schema_version: 1,
    defaults: {
      ...defaults,
      env: defaults.env && typeof defaults.env === "object" ? (defaults.env as Record<string, string>) : {},
    },
  };

  if (out.defaults.platform && !isSessionPlatform(out.defaults.platform)) {
    delete out.defaults.platform;
  }
  return out;
}

export async function writeSession(sessionName: string, session: SessionFile): Promise<void> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);
  await atomicWriteFile(getSessionFilePath(sessionName), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export async function setSessionDefaults(
  sessionName: string,
  {
    platform,
    device,
    appId,
    appPath,
    env,
  }: {
    platform?: string;
    device?: string;
    appId?: string;
    appPath?: string;
    env?: Record<string, string>;
  }
): Promise<SessionFile> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);

  return await withFileLock(dir, ".session", async () => {
    const current = await readSession(sessionName);
    const next: SessionFile = JSON.parse(JSON.stringify(current)) as SessionFile;

    if (platform !== undefined) {
      const p = platform.trim().toLowerCase();
      if (!isSessionPlatform(p)) {
        throw new CLIError(`Invalid --platform: ${platform} (expected ios or android)`, { exitCode: 2 });
      }
      next.defaults.platform = p;
    }
    if (device !== undefined) {
      const d = device.trim();
      if (!d) throw new CLIError("Invalid --device (empty)", { exitCode: 2 });
      next.defaults.device = { selector: d };
    }
    if (appId !== undefined) {
      const id = appId.trim();
      if (!id) throw new CLIError("Invalid --app-id (empty)", { exitCode: 2 });
      next.defaults.app = { ...(next.defaults.app ?? {}), app_id: id };
    }
    if (appPath !== undefined) {
      const p = appPath.trim();
      if (!p) throw new CLIError("Invalid --app (empty)", { exitCode: 2 });
      next.defaults.app = { ...(next.defaults.app ?? {}), app_path: p };
    }
    if (env) {
      next.defaults.env = { ...(next.defaults.env ?? {}), ...env };
    }

    await writeSession(sessionName, next);
    return next;
  });
}

export async function unsetSessionKey(sessionName: string, key: string): Promise<SessionFile> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);

  return await withFileLock(dir, ".session", async () => {
    const current = await readSession(sessionName);
    const next: SessionFile = JSON.parse(JSON.stringify(current)) as SessionFile;

  const trimmed = key.trim();
  if (trimmed === "platform") {
    delete next.defaults.platform;
  } else if (trimmed === "device") {
    delete next.defaults.device;
  } else if (trimmed === "app-id") {
    if (next.defaults.app) delete next.defaults.app.app_id;
    if (next.defaults.app && !next.defaults.app.app_id && !next.defaults.app.app_path) delete next.defaults.app;
  } else if (trimmed === "app") {
    if (next.defaults.app) delete next.defaults.app.app_path;
    if (next.defaults.app && !next.defaults.app.app_id && !next.defaults.app.app_path) delete next.defaults.app;
  } else if (trimmed.startsWith("env.")) {
    const envKey = trimmed.slice("env.".length);
    if (!envKey) throw new CLIError(`Invalid key: ${key}`, { exitCode: 2 });
    if (next.defaults.env) delete next.defaults.env[envKey];
  } else {
    throw new CLIError(`Unknown session key: ${key}`, { exitCode: 2 });
  }

    await writeSession(sessionName, next);
    return next;
  });
}

export async function resetSession(sessionName: string): Promise<void> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);
  await withFileLock(dir, ".session", async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  });
}

export async function writeLastSnapshot(sessionName: string, snapshot: unknown): Promise<void> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);
  await atomicWriteFile(getLastSnapshotPath(sessionName), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function readLastSnapshot(sessionName: string): Promise<unknown | null> {
  const raw = await fs.readFile(getLastSnapshotPath(sessionName), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeLastTarget(sessionName: string, target: unknown): Promise<void> {
  const dir = getSessionDir(sessionName);
  await ensureDir(dir);
  await atomicWriteFile(getLastTargetPath(sessionName), `${JSON.stringify(target, null, 2)}\n`, "utf8");
}
