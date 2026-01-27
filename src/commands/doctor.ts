import { parseArgs } from "node:util";
import { execFile } from "../lib/exec.js";
import { printHuman, printJSON } from "../lib/format.js";

type DoctorCheck = {
  name: string;
  ok: boolean;
  cmd: string;
  stdout: string;
  stderr: string;
  hint: string | null;
};

export async function cmdDoctor(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: { json?: boolean } };

  const checks: DoctorCheck[] = [];

  async function check(name: string, cmd: string, args: string[], hint: string): Promise<void> {
    const res = await execFile(cmd, args, { timeoutMs: 15000 });
    checks.push({
      name,
      ok: res.ok,
      cmd: [cmd, ...args].join(" "),
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      hint: res.ok ? null : hint,
    });
  }

  await check(
    "maestro",
    "maestro",
    ["--version"],
    "Install Maestro: `curl -Ls \"https://get.maestro.mobile.dev\" | bash` then ensure `~/.maestro/bin` is on PATH."
  );
  await check(
    "java",
    "java",
    ["-version"],
    "Install Java (recommended: Java 17)."
  );
  await check(
    "xcodebuild",
    "xcodebuild",
    ["-version"],
    "Install Xcode and run `xcode-select --install` for CLI tools."
  );
  await check(
    "simctl",
    "xcrun",
    ["simctl", "list", "devices", "--json"],
    "Ensure Xcode Command Line Tools are installed and `xcrun` is available."
  );
  await check(
    "adb",
    "adb",
    ["version"],
    "Install Android Platform Tools and ensure `adb` is on PATH."
  );
  await check(
    "emulator",
    "emulator",
    ["-list-avds"],
    "Install Android Emulator and ensure the `emulator` binary is on PATH."
  );

  const result = {
    ok: checks.every((c) => c.ok),
    checks,
  };

  if (values.json) {
    printJSON(result);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  const lines = [];
  lines.push(result.ok ? "OK: prerequisites look good." : "Missing prerequisites detected.");
  for (const c of checks) {
    lines.push(`- ${c.ok ? "OK" : "FAIL"} ${c.name}${c.ok ? "" : ` (${c.hint})`}`);
  }
  printHuman(lines);
  process.exitCode = result.ok ? 0 : 1;
}
