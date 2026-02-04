import path from "node:path";
import { usageError } from "./cliError.js";

export function validateSessionNameSyntax(sessionName: string): string {
  const name = String(sessionName ?? "").trim();
  if (!name) throw usageError("Invalid --session (empty)");
  if (name.length > 64) throw usageError("Invalid --session (too long; max 64 chars)");
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw usageError('Invalid --session (must not contain "/", "\\\\", or "..")');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw usageError("Invalid --session (allowed: letters, numbers, ., _, -)");
  }
  return name;
}

export function validateSessionName(sessionName: string, sessionsDir: string): string {
  const name = validateSessionNameSyntax(sessionName);
  const resolved = path.resolve(sessionsDir, name);
  const root = path.resolve(sessionsDir);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw usageError("Invalid --session (path escapes sessions directory)");
  }

  return name;
}
