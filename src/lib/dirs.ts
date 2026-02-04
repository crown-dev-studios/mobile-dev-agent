import os from "node:os";
import path from "node:path";
import { validateSessionName } from "./sessionName.js";

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function getStateDir(): string {
  const override = process.env.MOBILE_DEV_AGENT_STATE_DIR;
  if (override) return path.resolve(expandHome(override));

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "mobile-dev-agent");
  }

  const xdg = process.env.XDG_STATE_HOME;
  if (xdg) return path.join(path.resolve(expandHome(xdg)), "mobile-dev-agent");
  return path.join(home, ".local", "state", "mobile-dev-agent");
}

export function getCacheDir(): string {
  const override = process.env.MOBILE_DEV_AGENT_CACHE_DIR;
  if (override) return path.resolve(expandHome(override));

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Caches", "mobile-dev-agent");
  }

  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return path.join(path.resolve(expandHome(xdg)), "mobile-dev-agent");
  return path.join(home, ".cache", "mobile-dev-agent");
}

export function getSessionsDir(): string {
  return path.join(getStateDir(), "sessions");
}

export function getSessionDir(sessionName: string): string {
  const sessionsDir = getSessionsDir();
  const name = validateSessionName(sessionName, sessionsDir);
  return path.join(sessionsDir, name);
}

export function getSessionFilePath(sessionName: string): string {
  return path.join(getSessionDir(sessionName), "session.json");
}

export function getLastSnapshotPath(sessionName: string): string {
  return path.join(getSessionDir(sessionName), "last_snapshot.json");
}

export function getLastTargetPath(sessionName: string): string {
  return path.join(getSessionDir(sessionName), "last_target.json");
}

export function getLiveDir(sessionName: string): string {
  const name = validateSessionName(sessionName, getSessionsDir());
  return path.join(getStateDir(), "run", name);
}
