import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import { createRunDir, RunContext } from "../lib/run.js";
import type { CommandIO } from "../lib/io.js";
import { CLIError } from "../lib/cliError.js";
import {
  isTartInstalled,
  tartVersion,
  getTartStatus,
  runTartScript,
  buildTartEnv,
  type TartVMStatus,
} from "../lib/tart.js";

type TartCommandArgs = {
  argv: string[];
  sessionName: string;
  io: CommandIO;
};

/** Parse --key value and --key=value flags from argv. */
function parseTartFlags(argv: string[]): { flags: Record<string, string>; positionals: string[] } {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const eqIdx = token.indexOf("=");
    if (eqIdx !== -1) {
      flags[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[token.slice(2)] = next;
        i += 1;
      } else {
        flags[token.slice(2)] = "true";
      }
    }
  }

  return { flags, positionals };
}

function envFromFlags(flags: Record<string, string>): Record<string, string> {
  return buildTartEnv({
    vmName: flags["vm-name"] ?? flags["vm"],
    baseImage: flags["base-image"] ?? flags["image"],
    cpus: flags["cpus"],
    memory: flags["memory"],
    disk: flags["disk"],
    sshUser: flags["ssh-user"],
    sshPass: flags["ssh-pass"],
  });
}

// ─── tart setup ────────────────────────────────────────────────────────
export async function cmdTartSetup({
  argv,
  sessionName,
  io,
}: TartCommandArgs): Promise<{ envelope: ResultEnvelope<{ status: TartVMStatus }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const { flags } = parseTartFlags(argv);
  const env = envFromFlags(flags);

  // Pre-flight: check tart is installed
  if (!(await isTartInstalled())) {
    const envelope = createEnvelope({
      ok: false,
      command_name: "tart.setup",
      command_argv: ["tart", "setup", ...argv],
      session: sessionName,
      platform: null,
      started_at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      run_dir: runDir,
      artifacts: run.artifacts,
      data: { status: { vm: env.TART_VM_NAME ?? "mobile-dev-agent", exists: false, running: false, ip: null } },
      error: {
        code: "DEPENDENCY_MISSING",
        message: "tart is not installed",
        details: ["Install via: brew install cirruslabs/cli/tart"],
      },
      next_steps: [{ label: "Install tart", argv: ["doctor"] }],
    });
    await run.writeResultJson(envelope);
    envelope.artifacts = run.artifacts;
    if (io.config.mode === "human" && !io.config.quiet) {
      io.error(["Error: tart is not installed.", "Install via: brew install cirruslabs/cli/tart"]);
    }
    return { envelope, exitCode: 1 };
  }

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(["Setting up Tart VM for iOS testing...", "This may take a while on first run (base image download)."]);
  }

  const scriptRes = await runTartScript("tart-setup.sh", [], { env, timeoutMs: 3_600_000 });

  const status = await getTartStatus(env);
  const ok = scriptRes.ok;
  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok,
    command_name: "tart.setup",
    command_argv: ["tart", "setup", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { status },
    error: ok
      ? null
      : {
          code: "TART_SETUP_FAILED",
          message: "VM setup failed",
          details: [scriptRes.stderr.slice(0, 2000)],
        },
    next_steps: ok
      ? [
          { label: "Start VM", argv: ["tart", "start"] },
          { label: "Check status", argv: ["tart", "status"] },
        ]
      : [{ label: "Re-run setup", argv: ["tart", "setup"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    if (ok) {
      io.human(["VM setup complete.", `VM: ${status.vm}`, "Run: mobile-dev-agent tart start"]);
    } else {
      io.error(["VM setup failed.", scriptRes.stderr.slice(0, 500)]);
    }
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}

// ─── tart start ────────────────────────────────────────────────────────
export async function cmdTartStart({
  argv,
  sessionName,
  io,
}: TartCommandArgs): Promise<{ envelope: ResultEnvelope<{ status: TartVMStatus }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const { flags, positionals } = parseTartFlags(argv);
  const env = envFromFlags(flags);

  // Build launch args
  const launchArgs: string[] = [];
  if (flags["gui"] === "true") launchArgs.push("--gui");
  if (flags["ssh"] === "true") launchArgs.push("--ssh");
  if (flags["sync"] === "true") launchArgs.push("--sync");
  if (positionals.length > 0) {
    launchArgs.push("--run", ...positionals);
  }

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human(["Starting Tart VM..."]);
  }

  const scriptRes = await runTartScript("tart-launch.sh", launchArgs, { env, timeoutMs: 600_000 });
  const status = await getTartStatus(env);
  const ok = scriptRes.ok;
  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok,
    command_name: "tart.start",
    command_argv: ["tart", "start", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { status },
    error: ok
      ? null
      : {
          code: "TART_START_FAILED",
          message: "Failed to start VM",
          details: [scriptRes.stderr.slice(0, 2000)],
        },
    next_steps: ok
      ? [
          { label: "Run command in VM", argv: ["tart", "run", "doctor"] },
          { label: "Check status", argv: ["tart", "status"] },
          { label: "Stop VM", argv: ["tart", "stop"] },
        ]
      : [{ label: "Setup VM", argv: ["tart", "setup"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    if (ok) {
      const lines = [`VM '${status.vm}' is running.`];
      if (status.ip) lines.push(`SSH: ssh ${env.TART_SSH_USER ?? "admin"}@${status.ip}`);
      if (scriptRes.stdout) lines.push(scriptRes.stdout.trim());
      io.human(lines);
    } else {
      io.error(["Failed to start VM.", scriptRes.stderr.slice(0, 500)]);
    }
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}

// ─── tart run ──────────────────────────────────────────────────────────
export async function cmdTartRun({
  argv,
  sessionName,
  io,
}: TartCommandArgs): Promise<{ envelope: ResultEnvelope<{ output: string }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const { flags, positionals } = parseTartFlags(argv);
  const env = envFromFlags(flags);
  const doSync = flags["sync"] === "true";

  if (positionals.length === 0) {
    throw new CLIError("tart run requires a command to execute. Example: tart run doctor", { exitCode: 2 });
  }

  const launchArgs: string[] = [];
  if (doSync) launchArgs.push("--sync");
  launchArgs.push("--run", ...positionals);

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([`Running in VM: mobile-dev-agent ${positionals.join(" ")}`]);
  }

  const scriptRes = await runTartScript("tart-launch.sh", launchArgs, { env, timeoutMs: 600_000 });
  const ok = scriptRes.ok;
  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok,
    command_name: "tart.run",
    command_argv: ["tart", "run", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { output: scriptRes.stdout },
    error: ok
      ? null
      : {
          code: "TART_RUN_FAILED",
          message: "Command failed inside VM",
          details: [scriptRes.stderr.slice(0, 2000)],
        },
    next_steps: [],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    if (scriptRes.stdout.trim()) {
      io.human([scriptRes.stdout.trim()]);
    }
    if (!ok && scriptRes.stderr.trim()) {
      io.error([scriptRes.stderr.trim().slice(0, 500)]);
    }
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}

// ─── tart stop ─────────────────────────────────────────────────────────
export async function cmdTartStop({
  argv,
  sessionName,
  io,
}: TartCommandArgs): Promise<{ envelope: ResultEnvelope<{ status: TartVMStatus }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const { flags } = parseTartFlags(argv);
  const env = envFromFlags(flags);
  const doDelete = flags["delete"] === "true";

  const stopArgs = doDelete ? ["--delete"] : [];

  if (io.config.mode === "human" && !io.config.quiet) {
    io.human([doDelete ? "Stopping and deleting Tart VM..." : "Stopping Tart VM..."]);
  }

  const scriptRes = await runTartScript("tart-stop.sh", stopArgs, { env });
  const status = await getTartStatus(env);
  const ok = scriptRes.ok;
  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok,
    command_name: "tart.stop",
    command_argv: ["tart", "stop", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { status },
    error: ok
      ? null
      : {
          code: "TART_STOP_FAILED",
          message: "Failed to stop VM",
          details: [scriptRes.stderr.slice(0, 2000)],
        },
    next_steps: ok ? [{ label: "Start VM", argv: ["tart", "start"] }] : [],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    if (ok) {
      io.human([doDelete ? "VM stopped and deleted." : "VM stopped."]);
    } else {
      io.error(["Failed to stop VM.", scriptRes.stderr.slice(0, 500)]);
    }
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}

// ─── tart status ───────────────────────────────────────────────────────
export async function cmdTartStatus({
  argv,
  sessionName,
  io,
}: TartCommandArgs): Promise<{ envelope: ResultEnvelope<{ status: TartVMStatus }>; exitCode: number }> {
  const startedAt = new Date();
  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const { flags } = parseTartFlags(argv);
  const env = envFromFlags(flags);

  // Also check tart installation
  const installed = await isTartInstalled();
  const version = installed ? await tartVersion() : null;

  const status = installed
    ? await getTartStatus(env)
    : { vm: env.TART_VM_NAME ?? "mobile-dev-agent", exists: false, running: false, ip: null };

  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok: true,
    command_name: "tart.status",
    command_argv: ["tart", "status", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { status: { ...status, tart_installed: installed, tart_version: version } as TartVMStatus & { tart_installed: boolean; tart_version: string | null } },
    error: null,
    next_steps: !installed
      ? [{ label: "Install tart", argv: ["doctor"] }]
      : !status.exists
        ? [{ label: "Setup VM", argv: ["tart", "setup"] }]
        : !status.running
          ? [{ label: "Start VM", argv: ["tart", "start"] }]
          : [
              { label: "Run command in VM", argv: ["tart", "run", "doctor"] },
              { label: "Stop VM", argv: ["tart", "stop"] },
            ],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    const lines: string[] = [];
    lines.push(`Tart: ${installed ? `installed (${version})` : "NOT installed"}`);
    if (installed) {
      lines.push(`VM: ${status.vm}`);
      lines.push(`Exists: ${status.exists ? "yes" : "no"}`);
      lines.push(`Running: ${status.running ? "yes" : "no"}`);
      if (status.ip) lines.push(`IP: ${status.ip}`);
      if (status.config) {
        lines.push(`Config: ${status.config.cpus} CPUs, ${status.config.memory_mb} MB RAM, ${status.config.disk_gb} GB disk`);
        lines.push(`Base image: ${status.config.base_image}`);
      }
    }
    io.human(lines);
  }

  return { envelope, exitCode: 0 };
}
