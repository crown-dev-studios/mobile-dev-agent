import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { parseEnvList } from "../lib/env.js";
import { readSession, resetSession, setSessionDefaults, unsetSessionKey } from "../lib/session.js";

export async function cmdSessionShow({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ session: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);

  const envelope = createEnvelope({
    ok: true,
    command_name: "session.show",
    command_argv: ["session", "show", ...argv],
    session: sessionName,
    platform: session.defaults.platform ?? null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { session },
    error: null,
    next_steps: [{ label: "Update session defaults", argv: ["session", "set"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([JSON.stringify(session, null, 2)]);
  }

  return { envelope, exitCode: 0 };
}

type SessionSetValues = {
  platform?: string;
  device?: string;
  "app-id"?: string;
  app?: string;
  env?: string[];
};

export async function cmdSessionSet({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ session: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string" },
      device: { type: "string" },
      "app-id": { type: "string" },
      app: { type: "string" },
      env: { type: "string", multiple: true, default: [] },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: SessionSetValues };

  const env = parseEnvList(values.env ?? []);
  const session = await setSessionDefaults(sessionName, {
    platform: values.platform,
    device: values.device,
    appId: values["app-id"],
    appPath: values.app,
    env: Object.keys(env).length ? env : undefined,
  });

  const envelope = createEnvelope({
    ok: true,
    command_name: "session.set",
    command_argv: ["session", "set", ...argv],
    session: sessionName,
    platform: session.defaults.platform ?? null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { session },
    error: null,
    next_steps: [{ label: "Show session", argv: ["session", "show"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(["Updated session.", JSON.stringify(session, null, 2)]);
  }

  return { envelope, exitCode: 0 };
}

export async function cmdSessionUnset({
  argv,
  sessionName,
  io,
  key,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
  key: string;
}): Promise<{ envelope: ResultEnvelope<{ session: unknown }>; exitCode: number }> {
  const startedAt = new Date();
  const session = await unsetSessionKey(sessionName, key);

  const envelope = createEnvelope({
    ok: true,
    command_name: "session.unset",
    command_argv: ["session", "unset", key, ...argv],
    session: sessionName,
    platform: session.defaults.platform ?? null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { session },
    error: null,
    next_steps: [{ label: "Show session", argv: ["session", "show"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(["Updated session.", JSON.stringify(session, null, 2)]);
  }

  return { envelope, exitCode: 0 };
}

export async function cmdSessionReset({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ reset: boolean }>; exitCode: number }> {
  const startedAt = new Date();
  await resetSession(sessionName);

  const envelope = createEnvelope({
    ok: true,
    command_name: "session.reset",
    command_argv: ["session", "reset", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { reset: true },
    error: null,
    next_steps: [{ label: "Show session", argv: ["session", "show"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(["Session reset."]);
  }

  return { envelope, exitCode: 0 };
}
