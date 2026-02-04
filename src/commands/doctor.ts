import { createEnvelope, type ResultEnvelope } from "../lib/envelope.js";
import { createRunDir, RunContext } from "../lib/run.js";
import type { CommandIO } from "../lib/io.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  hint: string | null;
};

export async function cmdDoctor({
  argv,
  sessionName,
  io,
}: {
  argv: string[];
  sessionName: string;
  io: CommandIO;
}): Promise<{ envelope: ResultEnvelope<{ checks: DoctorCheck[] }>; exitCode: number }> {
  const startedAt = new Date();

  const runDir = await createRunDir();
  const run = new RunContext(runDir, { onEvent: (e) => io.event(e) });
  io.attachRun(run);

  const checks: DoctorCheck[] = [];

  async function check(name: string, cmd: string, args: string[], hint: string): Promise<void> {
    const res = await run.execLogged("doctor", name, cmd, args, { timeoutMs: 15000 });
    checks.push({
      name,
      ok: res.ok,
      command: res.command,
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      hint: res.ok ? null : hint,
    });
  }

  await check(
    "maestro",
    "maestro",
    ["--version"],
    'Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash` then ensure `~/.maestro/bin` is on PATH.'
  );
  await check("java", "java", ["-version"], "Install Java (recommended: Java 17).");
  await check("xcodebuild", "xcodebuild", ["-version"], "Install Xcode and `xcode-select --install`.");
  await check(
    "simctl",
    "xcrun",
    ["simctl", "list", "devices", "--json"],
    "Ensure Xcode Command Line Tools are installed and `xcrun` is available."
  );
  await check("adb", "adb", ["version"], "Install Android Platform Tools and ensure `adb` is on PATH.");
  await check("emulator", "emulator", ["-list-avds"], "Install Android Emulator and ensure `emulator` is on PATH.");
  await check(
    "axe",
    "axe",
    ["--version"],
    "Install AXe CLI or set MOBILE_DEV_AGENT_AXE_PATH to its absolute path."
  );

  const ok = checks.every((c) => c.ok);
  const durationMs = Date.now() - startedAt.getTime();

  const envelope = createEnvelope({
    ok,
    command_name: "doctor",
    command_argv: ["doctor", ...argv],
    session: sessionName,
    platform: null,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    run_dir: runDir,
    artifacts: run.artifacts,
    data: { checks },
    error: ok
      ? null
      : { code: "DEPENDENCY_MISSING", message: "One or more checks failed.", details: checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.hint ?? "failed"}`) },
    next_steps: ok ? [] : [{ label: "Re-run doctor", argv: ["doctor"] }],
  });

  await run.writeResultJson(envelope);
  envelope.artifacts = run.artifacts;

  if (io.config.mode === "human" && !io.config.quiet) {
    const lines: string[] = [];
    lines.push(ok ? "OK: prerequisites look good." : "Missing prerequisites detected.");
    for (const c of checks) {
      lines.push(`- ${c.ok ? "OK" : "FAIL"} ${c.name}${c.ok ? "" : c.hint ? ` (${c.hint})` : ""}`);
    }
    io.human(lines);
  }

  return { envelope, exitCode: ok ? 0 : 1 };
}
