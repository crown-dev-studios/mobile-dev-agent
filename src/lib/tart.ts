import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, type ExecResult } from "./exec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the tart/ scripts directory relative to the project root. */
export function getTartScriptsDir(): string {
  // src/lib/tart.ts → ../../tart/
  return path.resolve(__dirname, "..", "..", "..", "..", "tart");
}

export type TartVMStatus = {
  vm: string;
  exists: boolean;
  running: boolean;
  ip: string | null;
  config?: {
    cpus: number;
    memory_mb: number;
    disk_gb: number;
    base_image: string;
    ssh_user: string;
  };
};

/** Check whether the `tart` binary is available on PATH. */
export async function isTartInstalled(): Promise<boolean> {
  const res = await execFile("tart", ["--version"], { timeoutMs: 5000 });
  return res.ok;
}

/** Get the version string from the tart CLI. */
export async function tartVersion(): Promise<string | null> {
  const res = await execFile("tart", ["--version"], { timeoutMs: 5000 });
  return res.ok ? res.stdout.trim() : null;
}

/** Run a tart shell script and return the result. */
export async function runTartScript(
  scriptName: string,
  args: string[] = [],
  opts: { env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<ExecResult> {
  const scriptsDir = getTartScriptsDir();
  const scriptPath = path.join(scriptsDir, scriptName);
  return await execFile("bash", [scriptPath, ...args], {
    env: opts.env ? { ...process.env, ...opts.env } as NodeJS.ProcessEnv : undefined,
    timeoutMs: opts.timeoutMs ?? 600_000, // 10 min default for VM operations
  });
}

/** Parse the JSON status output from tart-status.sh. */
export function parseTartStatus(stdout: string): TartVMStatus {
  try {
    return JSON.parse(stdout) as TartVMStatus;
  } catch {
    return { vm: "unknown", exists: false, running: false, ip: null };
  }
}

/** Get VM status by running tart-status.sh. */
export async function getTartStatus(envOverrides?: Record<string, string>): Promise<TartVMStatus> {
  const res = await runTartScript("tart-status.sh", [], { env: envOverrides });
  if (!res.ok) {
    return { vm: envOverrides?.TART_VM_NAME ?? "mobile-dev-agent", exists: false, running: false, ip: null };
  }
  return parseTartStatus(res.stdout);
}

/**
 * Build the environment overrides object from CLI flags.
 * Only sets values that were explicitly provided.
 */
export function buildTartEnv(opts: {
  vmName?: string;
  baseImage?: string;
  cpus?: string;
  memory?: string;
  disk?: string;
  sshUser?: string;
  sshPass?: string;
}): Record<string, string> {
  const env: Record<string, string> = {};
  if (opts.vmName) env.TART_VM_NAME = opts.vmName;
  if (opts.baseImage) env.TART_BASE_IMAGE = opts.baseImage;
  if (opts.cpus) env.TART_VM_CPUS = opts.cpus;
  if (opts.memory) env.TART_VM_MEMORY = opts.memory;
  if (opts.disk) env.TART_VM_DISK = opts.disk;
  if (opts.sshUser) env.TART_SSH_USER = opts.sshUser;
  if (opts.sshPass) env.TART_SSH_PASS = opts.sshPass;
  return env;
}
