import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ensureDir, safeName } from "./paths.js";
import { getCacheDir } from "./dirs.js";
import { atomicWriteFile } from "./fsAtomic.js";

export type RunArtifact = {
  type: string;
  path: string;
  mime: string;
};

export type JsonlEvent = {
  type: "event";
  ts: string;
  event: "spawn" | "output" | "artifact" | "progress" | "warning" | "error";
  data: unknown;
};

export type JsonlResult<T extends object> = { type: "result" } & T;

export type ExecLoggedResult = {
  ok: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  command: string;
  logPath: string;
};

export type ExecBinaryToFileResult = {
  ok: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  command: string;
  logPath: string;
  outPath: string;
  bytesWritten: number;
  stderr: string;
};

function nowRFC3339(): string {
  return new Date().toISOString();
}

function yyyymmddHHMMSS(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function createRunDir(): Promise<string> {
  const root = path.join(getCacheDir(), "runs");
  await ensureDir(root);
  const stamp = yyyymmddHHMMSS(new Date());
  const rand = crypto.randomBytes(3).toString("hex");
  const dir = path.join(root, `${stamp}-${rand}`);
  await ensureDir(dir);
  await ensureDir(path.join(dir, "logs"));
  await ensureDir(path.join(dir, "artifacts"));
  return dir;
}

export class RunContext {
  runDir: string;
  artifacts: RunArtifact[] = [];
  #tracePath: string;
  #logSeq = 0;
  #onEvent: ((event: JsonlEvent) => void) | null;
  #traceWrite: Promise<void> = Promise.resolve();
  #maxCaptureBytes: number;

  constructor(
    runDir: string,
    {
      onEvent,
      maxCaptureBytes = 1024 * 1024,
    }: { onEvent?: (event: JsonlEvent) => void; maxCaptureBytes?: number } = {}
  ) {
    this.runDir = runDir;
    this.#tracePath = path.join(runDir, "trace.jsonl");
    this.#onEvent = onEvent ?? null;
    this.#maxCaptureBytes = maxCaptureBytes;
    this.artifacts.push({ type: "trace", path: this.#tracePath, mime: "application/x-ndjson" });
  }

  get artifactsDir(): string {
    return path.join(this.runDir, "artifacts");
  }

  get logsDir(): string {
    return path.join(this.runDir, "logs");
  }

  emit(event: JsonlEvent): void {
    const line = `${JSON.stringify(event)}\n`;
    // Serialize async appends to preserve event order without blocking the event loop.
    this.#traceWrite = this.#traceWrite.then(() => fs.appendFile(this.#tracePath, line, "utf8")).catch(() => {});
    this.#onEvent?.(event);
  }

  artifact(artifact: RunArtifact): void {
    this.artifacts.push(artifact);
    this.emit({ type: "event", ts: nowRFC3339(), event: "artifact", data: artifact });
  }

  async writeResultJson(result: unknown): Promise<string> {
    const p = path.join(this.runDir, "result.json");
    // Ensure the persisted envelope matches the in-memory envelope by adding the artifact before writing.
    this.artifact({ type: "result", path: p, mime: "application/json" });
    await atomicWriteFile(p, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return p;
  }

  async execLogged(
    tool: string,
    action: string,
    cmd: string,
    args: string[],
    {
      cwd,
      env,
      timeoutMs,
      stdoutPath,
    }: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      stdoutPath?: string;
    } = {}
  ): Promise<ExecLoggedResult> {
    this.#logSeq += 1;
    const logName = `${String(this.#logSeq).padStart(3, "0")}_${safeName(tool)}_${safeName(action)}.log`;
    const logPath = path.join(this.logsDir, logName);

    this.artifact({ type: "process_log", path: logPath, mime: "text/plain" });

    const fullCommand = [cmd, ...args].join(" ");
    this.emit({
      type: "event",
      ts: nowRFC3339(),
      event: "spawn",
      data: { tool, action, cmd, args, command: fullCommand },
    });

    const out = await new Promise<ExecLoggedResult>((resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let stdoutBuf = "";
      let stderrBuf = "";
      let stdoutTruncated = false;
      let stderrTruncated = false;

      const appendCapped = (cur: string, chunk: string): { next: string; truncated: boolean } => {
        if (this.#maxCaptureBytes <= 0) return { next: "", truncated: true };
        if (Buffer.byteLength(cur, "utf8") >= this.#maxCaptureBytes) return { next: cur, truncated: true };
        const remaining = this.#maxCaptureBytes - Buffer.byteLength(cur, "utf8");
        if (Buffer.byteLength(chunk, "utf8") <= remaining) return { next: cur + chunk, truncated: false };
        return { next: cur + chunk.slice(0, Math.max(0, remaining)), truncated: true };
      };

      const logStream = fssync.createWriteStream(logPath, { flags: "a" });
      const stdoutStream = stdoutPath ? fssync.createWriteStream(stdoutPath, { flags: "w" }) : null;
      const writeLines = (streamName: "stdout" | "stderr", chunk: string, bufferRef: "stdout" | "stderr") => {
        const ts = nowRFC3339();
        const combined = (bufferRef === "stdout" ? stdoutBuf : stderrBuf) + chunk;
        const parts = combined.split(/\r?\n/);
        const last = parts.pop() ?? "";
        for (const line of parts) {
          logStream.write(`${ts} ${streamName} | ${line}\n`);
        }
        if (bufferRef === "stdout") stdoutBuf = last;
        else stderrBuf = last;
      };

      let timeout: NodeJS.Timeout | undefined;
      if (timeoutMs && timeoutMs > 0) {
        timeout = setTimeout(() => {
          child.kill("SIGKILL");
        }, timeoutMs);
      }

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (d: string) => {
        const r = appendCapped(stdout, d);
        stdout = r.next;
        stdoutTruncated = stdoutTruncated || r.truncated;
        stdoutStream?.write(d);
        writeLines("stdout", d, "stdout");
      });
      child.stderr?.on("data", (d: string) => {
        const r = appendCapped(stderr, d);
        stderr = r.next;
        stderrTruncated = stderrTruncated || r.truncated;
        writeLines("stderr", d, "stderr");
      });

      child.on("error", (err) => {
        if (timeout) clearTimeout(timeout);
        stdoutStream?.end();
        logStream.end();
        resolve({
          ok: false,
          code: null,
          signal: null,
          stdout,
          stderr: `${stderr}${stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n"}${String(err)}`,
          command: fullCommand,
          logPath,
        });
      });

      child.on("close", (code, signal) => {
        if (timeout) clearTimeout(timeout);
        const ts = nowRFC3339();
        if (stdoutBuf) logStream.write(`${ts} stdout | ${stdoutBuf}\n`);
        if (stderrBuf) logStream.write(`${ts} stderr | ${stderrBuf}\n`);
        logStream.end();
        stdoutStream?.end();
        if (stdoutTruncated) stdout += "\n…<stdout truncated>\n";
        if (stderrTruncated) stderr += "\n…<stderr truncated>\n";
        resolve({
          ok: code === 0,
          code,
          signal: signal ?? null,
          stdout,
          stderr,
          command: fullCommand,
          logPath,
        });
      });
    });

    if (!out.ok) {
      this.emit({
        type: "event",
        ts: nowRFC3339(),
        event: "error",
        data: { tool, action, command: out.command, code: out.code, stderr: out.stderr.slice(0, 2000) },
      });
    }

    return out;
  }

  async execBinaryToFile(
    tool: string,
    action: string,
    cmd: string,
    args: string[],
    {
      cwd,
      env,
      timeoutMs,
      outPath,
    }: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      outPath: string;
    }
  ): Promise<ExecBinaryToFileResult> {
    this.#logSeq += 1;
    const logName = `${String(this.#logSeq).padStart(3, "0")}_${safeName(tool)}_${safeName(action)}.log`;
    const logPath = path.join(this.logsDir, logName);
    this.artifact({ type: "process_log", path: logPath, mime: "text/plain" });

    const fullCommand = [cmd, ...args].join(" ");
    this.emit({
      type: "event",
      ts: nowRFC3339(),
      event: "spawn",
      data: { tool, action, cmd, args, command: fullCommand, outPath },
    });

    await ensureDir(path.dirname(outPath));

    return await new Promise<ExecBinaryToFileResult>((resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const logStream = fssync.createWriteStream(logPath, { flags: "a" });
      const outStream = fssync.createWriteStream(outPath, { flags: "w" });
      let bytesWritten = 0;
      let stderr = "";
      let stderrBuf = "";
      let stderrTruncated = false;

      const appendCapped = (cur: string, chunk: string): { next: string; truncated: boolean } => {
        if (this.#maxCaptureBytes <= 0) return { next: "", truncated: true };
        if (Buffer.byteLength(cur, "utf8") >= this.#maxCaptureBytes) return { next: cur, truncated: true };
        const remaining = this.#maxCaptureBytes - Buffer.byteLength(cur, "utf8");
        if (Buffer.byteLength(chunk, "utf8") <= remaining) return { next: cur + chunk, truncated: false };
        return { next: cur + chunk.slice(0, Math.max(0, remaining)), truncated: true };
      };

      let timeout: NodeJS.Timeout | undefined;
      if (timeoutMs && timeoutMs > 0) {
        timeout = setTimeout(() => {
          child.kill("SIGKILL");
        }, timeoutMs);
      }

      child.stdout?.on("data", (buf: Buffer) => {
        bytesWritten += buf.length;
      });
      child.stdout?.pipe(outStream);

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (d: string) => {
        const r = appendCapped(stderr, d);
        stderr = r.next;
        stderrTruncated = stderrTruncated || r.truncated;
        const ts = nowRFC3339();
        const combined = stderrBuf + d;
        const parts = combined.split(/\r?\n/);
        const last = parts.pop() ?? "";
        for (const line of parts) {
          logStream.write(`${ts} stderr | ${line}\n`);
        }
        stderrBuf = last;
      });

      child.on("error", (err) => {
        if (timeout) clearTimeout(timeout);
        const ts = nowRFC3339();
        if (stderrBuf) logStream.write(`${ts} stderr | ${stderrBuf}\n`);
        logStream.write(`${ts} stderr | ${String(err)}\n`);
        logStream.end();
        outStream.end();
        resolve({
          ok: false,
          code: null,
          signal: null,
          command: fullCommand,
          logPath,
          outPath,
          bytesWritten,
          stderr: `${stderr}${stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n"}${String(err)}`,
        });
      });

      child.on("close", (code, signal) => {
        if (timeout) clearTimeout(timeout);
        const ts = nowRFC3339();
        if (stderrBuf) logStream.write(`${ts} stderr | ${stderrBuf}\n`);
        logStream.write(`${ts} stdout | <binary ${bytesWritten} bytes>\n`);
        logStream.end();
        outStream.end();
        if (stderrTruncated) stderr += "\n…<stderr truncated>\n";
        resolve({
          ok: code === 0,
          code,
          signal: signal ?? null,
          command: fullCommand,
          logPath,
          outPath,
          bytesWritten,
          stderr,
        });
      });
    });
  }
}
