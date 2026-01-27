import { spawn } from "node:child_process";

export type ExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stream?: boolean | "stderr";
};

export type ExecResult = {
  ok: boolean;
  code: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: unknown;
};

export async function execFile(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const { cwd, env, timeoutMs, stream = false } = opts;
  const streamMode = stream === "stderr" ? "stderr" : stream ? "inherit" : "pipe";

  return await new Promise<ExecResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: streamMode === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    let timeout: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, timeoutMs);
    }

    if (streamMode === "pipe") {
      if (child.stdout) {
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (d) => {
          stdout += d;
        });
      }
      if (child.stderr) {
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (d) => {
          stderr += d;
        });
      }
    }
    if (streamMode === "stderr") {
      child.stdout?.pipe(process.stderr);
      child.stderr?.pipe(process.stderr);
    }

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n"}${String(err)}`,
        error: err,
      });
    });

    child.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        ok: code === 0,
        code,
        signal: signal ?? null,
        stdout,
        stderr,
      });
    });
  });
}
