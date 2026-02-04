import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { readSession } from "../lib/session.js";
import { getLiveDir } from "../lib/dirs.js";
import { CLIError, usageError } from "../lib/cliError.js";
import { parsePlatform } from "../lib/platform.js";

type LogsTailValues = { follow?: boolean; platform?: string; device?: string; "app-id"?: string };

export async function cmdLogsTail({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<unknown>; exitCode: number }> {
  const startedAt = new Date();
  const session = await readSession(sessionName);
  const { values } = parseArgs({
    args: argv,
    options: {
      follow: { type: "boolean", default: false },
      platform: { type: "string", default: session.defaults.platform ?? "ios" },
      device: { type: "string", default: session.defaults.device?.selector ?? "" },
      "app-id": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: LogsTailValues };

  if (values.follow) {
    if (io.config.mode !== "jsonl") {
      throw usageError("logs tail --follow requires --jsonl");
    }
    throw new CLIError("Live mode follow is not implemented yet.", { exitCode: 1 });
  }

  const liveLog = `${getLiveDir(sessionName)}/live.log`;
  const raw = await fs.readFile(liveLog, "utf8").catch(() => "");
  const lines = raw ? raw.trimEnd().split(/\r?\n/).slice(-200) : [];

  const envelope = createEnvelope({
    ok: true,
    command_name: "logs.tail",
    command_argv: ["logs", "tail", ...argv],
    session: sessionName,
    platform: parsePlatform(values.platform || "ios"),
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { lines, path: liveLog },
    error: null,
    next_steps: [{ label: "Follow logs (jsonl)", argv: ["logs", "tail", "--follow", "--jsonl"] }],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(lines.length ? lines : ["(no logs)"]);
  }

  return { envelope, exitCode: 0 };
}
