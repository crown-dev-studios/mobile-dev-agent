import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type RunResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function distBinPath(): string {
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  // When compiled, this file lives at dist/test/*.js
  return path.resolve(dirname, "../src/bin/mobile-dev-agent.js");
}

async function runCli(
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<RunResult> {
  const timeoutMs = opts?.timeoutMs ?? 2000;
  const child = spawn(process.execPath, [distBinPath(), ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opts?.env },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    stdout += d;
  });
  child.stderr.on("data", (d) => {
    stderr += d;
  });

  const exited = new Promise<RunResult>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });

  const timeout = new Promise<RunResult>((resolve) => {
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, signal: "SIGKILL", stdout, stderr });
    }, timeoutMs).unref();
  });

  const result = await Promise.race([exited, timeout]);
  if (result.signal === "SIGKILL") {
    throw new Error(`CLI timed out after ${timeoutMs}ms: ${args.join(" ")}`);
  }
  return result;
}

test("global parse errors honor --json structured output", async () => {
  const result = await runCli(["--json", "--session"]);
  assert.equal(result.code, 2);
  assert.equal(result.stderr.trim(), "");

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error?.message ?? "", /--session requires a value/);
});

test("global parse errors honor --jsonl structured output", async () => {
  const result = await runCli(["--jsonl", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.stderr.trim(), "");

  const line = result.stdout.trim().split("\n")[0] ?? "";
  const payload = JSON.parse(line);
  assert.equal(payload.type, "result");
  assert.equal(payload.ok, false);
  assert.match(payload.error?.message ?? "", /Use only one of --json or --jsonl/);
});

test("unknown command returns usage error", async () => {
  const result = await runCli(["studio"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown command: studio/);
});
