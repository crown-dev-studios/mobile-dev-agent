import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { CLIError } from "../lib/cliError.js";

type LiveStartValues = { ttl?: string };

export async function cmdLiveStart({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  const { values } = parseArgs({
    args: argv,
    options: { ttl: { type: "string", default: "10m" } },
    allowPositionals: true,
    strict: true,
  }) as { values: LiveStartValues };

  const envelope = createEnvelope({
    ok: false,
    command_name: "live.start",
    command_argv: ["live", "start", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { ttl: values.ttl },
    error: { code: "NOT_IMPLEMENTED", message: "Live mode is not implemented yet.", details: [] },
    next_steps: [],
  });

  if (io.config.mode === "human" && !io.config.quiet) io.error(envelope.error?.message ?? "Live start failed.");
  return { envelope, exitCode: 1 };
}

export async function cmdLiveStatus({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  void argv;
  void sessionName;
  const envelope = createEnvelope({
    ok: false,
    command_name: "live.status",
    command_argv: ["live", "status", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: {},
    error: { code: "NOT_IMPLEMENTED", message: "Live mode is not implemented yet.", details: [] },
    next_steps: [],
  });
  if (io.config.mode === "human" && !io.config.quiet) io.error(envelope.error?.message ?? "Live status failed.");
  return { envelope, exitCode: 1 };
}

export async function cmdLiveStop({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  void argv;
  void sessionName;
  const envelope = createEnvelope({
    ok: false,
    command_name: "live.stop",
    command_argv: ["live", "stop", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: {},
    error: { code: "NOT_IMPLEMENTED", message: "Live mode is not implemented yet.", details: [] },
    next_steps: [],
  });
  if (io.config.mode === "human" && !io.config.quiet) io.error(envelope.error?.message ?? "Live stop failed.");
  return { envelope, exitCode: 1 };
}

export async function cmdRepl({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  void argv;
  const startedAt = new Date();
  if (io.config.mode !== "jsonl") {
    throw new CLIError("repl requires --jsonl (default true in vNext)", { exitCode: 2 });
  }
  const envelope = createEnvelope({
    ok: false,
    command_name: "repl",
    command_argv: ["repl", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: {},
    error: { code: "NOT_IMPLEMENTED", message: "repl is not implemented yet.", details: [] },
    next_steps: [],
  });
  io.event({
    type: "event",
    ts: new Date().toISOString(),
    event: "warning",
    data: { message: envelope.error?.message ?? "repl failed" },
  });
  return { envelope, exitCode: 1 };
}
