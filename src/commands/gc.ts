import { parseArgs } from "node:util";
import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import type { CommandIO } from "../lib/io.js";
import { executeGC, planGC } from "../lib/gc.js";

type GCValues = { "dry-run"?: boolean; "keep-last"?: string; "keep-failure-days"?: string; "max-bytes"?: string };

function envNumber(name: string): number | null {
  const v = process.env[name];
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function cmdGC({
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
    options: {
      "dry-run": { type: "boolean", default: false },
      "keep-last": { type: "string", default: String(envNumber("MOBILE_DEV_AGENT_GC_KEEP_LAST") ?? 20) },
      "keep-failure-days": { type: "string", default: String(envNumber("MOBILE_DEV_AGENT_GC_KEEP_FAILURE_DAYS") ?? 7) },
      "max-bytes": { type: "string", default: String(envNumber("MOBILE_DEV_AGENT_GC_MAX_BYTES") ?? 2147483648) },
    },
    allowPositionals: true,
    strict: true,
  }) as { values: GCValues };

  const dryRun = Boolean(values["dry-run"]);
  const keepLast = Number(values["keep-last"] ?? 20);
  const keepFailureDays = Number(values["keep-failure-days"] ?? 7);
  const maxBytes = Number(values["max-bytes"] ?? 2147483648);

  const plan = await planGC({ keepLast, keepFailureDays, maxBytes });
  await executeGC(plan, { dryRun });

  const envelope = createEnvelope({
    ok: true,
    command_name: "gc",
    command_argv: ["gc", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    run_dir: null,
    artifacts: [],
    data: { dry_run: dryRun, plan },
    error: null,
    next_steps: [],
  });

  if (io.config.mode === "human" && !io.config.quiet) {
    const lines: string[] = [];
    lines.push(`${dryRun ? "Dry run:" : "Deleted:"} ${plan.delete.length} runs`);
    for (const r of plan.delete) lines.push(`- ${r.dir} (${r.sizeBytes} bytes)`);
    lines.push(`Remaining: ${plan.keep.length} runs`);
    lines.push(`Bytes: ${plan.afterBytes}/${plan.maxBytes}`);
    io.human(lines);
  }

  return { envelope, exitCode: 0 };
}
