import process from "node:process";
import { parseGlobalArgs, type GlobalArgs, type ParsedGlobal } from "./lib/argv.js";
import { validateSessionName } from "./lib/sessionName.js";
import { getSessionsDir } from "./lib/dirs.js";
import { CommandIO, type OutputMode } from "./lib/io.js";
import { getHelpText } from "./helpCanon.js";
import { normalizeError, getExitCode } from "./lib/errors.js";
import { CLIError } from "./lib/cliError.js";
import { getVersionString } from "./lib/version.js";

import { cmdDoctor } from "./commands/doctor.js";
import { cmdSessionReset, cmdSessionSet, cmdSessionShow, cmdSessionUnset } from "./commands/session.js";
import { cmdDeviceBoot, cmdDeviceErase, cmdDeviceList, cmdDeviceScreenshot, cmdDeviceShutdown } from "./commands/device.js";
import {
  cmdAppBuildIOS,
  cmdAppId,
  cmdAppInstall,
  cmdAppLaunch,
  cmdAppTerminate,
  cmdAppUninstall,
} from "./commands/app.js";
import { cmdUiAssertVisible, cmdUiFind, cmdUiPress, cmdUiSnapshot, cmdUiSwipe, cmdUiTap, cmdUiType } from "./commands/ui.js";
import { cmdFlowRun } from "./commands/flow.js";
import { cmdTest } from "./commands/test.js";
import { cmdGC } from "./commands/gc.js";
import { cmdLogsTail } from "./commands/logs.js";
import { cmdLiveStart, cmdLiveStatus, cmdLiveStop, cmdRepl } from "./commands/live.js";

function isGroupCommand(cmd: string): boolean {
  return ["session", "device", "app", "ui", "flow", "logs", "live"].includes(cmd);
}

function deriveCommandName(rest: string[]): string {
  const [cmd, sub] = rest;
  if (!cmd) return "unknown";
  if (isGroupCommand(cmd) && sub && !sub.startsWith("-")) return `${cmd}.${sub}`;
  return cmd;
}

function helpKeyFromArgs(args: string[]): string {
  const a = [...args];
  if (a[0] === "help") a.shift();

  if (a.length === 0) return "";

  const cmd = a[0]!;
  const sub = a[1];

  if (isGroupCommand(cmd) && sub && !sub.startsWith("-")) return `${cmd} ${sub}`;
  return cmd;
}

function printHelp(key: string): void {
  const text = getHelpText(key) ?? getHelpText("") ?? "";
  process.stdout.write(text);
}

function splitPositionalPrefix(args: string[]): { positionals: string[]; rest: string[] } {
  const positionals: string[] = [];
  let i = 0;
  for (; i < args.length; i += 1) {
    const t = args[i]!;
    if (t.startsWith("-")) break;
    positionals.push(t);
  }
  return { positionals, rest: args.slice(i) };
}

function parseGlobalArgsLenient(argv: string[]): ParsedGlobal {
  const globals: GlobalArgs = {
    session: "default",
    json: false,
    jsonl: false,
    quiet: false,
    verbose: false,
    help: false,
  };

  const rest: string[] = [];

  const isFlag = (token: string): boolean => token.startsWith("-");
  const splitFlag = (token: string): { key: string; value: string | null } => {
    const idx = token.indexOf("=");
    if (idx === -1) return { key: token, value: null };
    return { key: token.slice(0, idx), value: token.slice(idx + 1) };
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (!isFlag(token)) {
      rest.push(token);
      continue;
    }

    const { key, value } = splitFlag(token);
    if (key === "--session") {
      const v = value ?? argv[i + 1];
      if (v == null) continue;
      try {
        globals.session = validateSessionName(v, getSessionsDir());
      } catch {
        // Keep default; structured error handling will run once strict parsing executes.
      }
      if (value == null) i += 1;
      continue;
    }
    if (key === "--json") {
      globals.json = true;
      continue;
    }
    if (key === "--jsonl") {
      globals.jsonl = true;
      continue;
    }
    if (key === "--quiet") {
      globals.quiet = true;
      continue;
    }
    if (key === "--verbose") {
      globals.verbose = true;
      continue;
    }
    if (key === "--help" || key === "-h") {
      globals.help = true;
      continue;
    }

    // Not a recognized global flag; keep it for command parsing.
    rest.push(token);
    if (value == null && i + 1 < argv.length && !isFlag(argv[i + 1]!)) {
      rest.push(argv[i + 1]!);
      i += 1;
    }
  }

  return { globals, rest };
}

export async function main(argv: string[]): Promise<void> {
  const startedAt = new Date();

  // Best-effort parse so we can still respect structured output flags if global parsing fails.
  let { globals, rest } = parseGlobalArgsLenient(argv);
  let mode: OutputMode = globals.jsonl ? "jsonl" : globals.json ? "json" : "human";

  // repl defaults to jsonl.
  if (rest[0] === "repl" && mode === "human") mode = "jsonl";

  let io = new CommandIO({ mode, quiet: globals.quiet, verbose: globals.verbose });

  try {
    ({ globals, rest } = parseGlobalArgs(argv));
    mode = globals.jsonl ? "jsonl" : globals.json ? "json" : "human";
    if (rest[0] === "repl" && mode === "human") mode = "jsonl";
    io = new CommandIO({ mode, quiet: globals.quiet, verbose: globals.verbose });

    if (globals.help) {
      const key = helpKeyFromArgs(rest);
      printHelp(key);
      process.exitCode = 0;
      return;
    }

    if (rest.length === 0) {
      printHelp("");
      process.exitCode = 2;
      return;
    }

    const [commandRaw, ...argsRaw] = rest;
    if (!commandRaw) {
      printHelp("");
      process.exitCode = 2;
      return;
    }

    const runAndExit = async (p: Promise<{ envelope: any; exitCode: number }>): Promise<void> => {
      const { envelope, exitCode } = await p;
      io.result(envelope);
      process.exitCode = exitCode;
    };

    const group = async (
      label: string,
      args: string[],
      handlers: Record<string, (argv: string[]) => Promise<{ envelope: any; exitCode: number }>>
    ): Promise<void> => {
      const [sub, ...subArgs] = args;
      if (!sub) throw new CLIError(`${label} requires a subcommand`, { exitCode: 2 });
      const h = handlers[sub];
      if (!h) throw new CLIError(`Unknown ${label} subcommand: ${sub}`, { exitCode: 2 });
      await runAndExit(h(subArgs));
    };

    const commands: Record<string, (args: string[]) => Promise<void>> = {
      doctor: async (args) => runAndExit(cmdDoctor({ argv: args, sessionName: globals.session, io })),
      test: async (args) => runAndExit(cmdTest({ argv: args, sessionName: globals.session, io })),
      gc: async (args) => runAndExit(cmdGC({ argv: args, sessionName: globals.session, io })),
      repl: async (args) => runAndExit(cmdRepl({ argv: args, sessionName: globals.session, io })),
      session: async (args) =>
        group("session", args, {
          show: (a) => cmdSessionShow({ argv: a, sessionName: globals.session, io }),
          set: (a) => cmdSessionSet({ argv: a, sessionName: globals.session, io }),
          unset: async (a) => {
            const [key, ...restArgs] = a;
            if (!key) throw new CLIError("session unset requires <key>", { exitCode: 2 });
            return await cmdSessionUnset({ argv: restArgs, sessionName: globals.session, io, key });
          },
          reset: (a) => cmdSessionReset({ argv: a, sessionName: globals.session, io }),
        }),
      device: async (args) =>
        group("device", args, {
          list: (a) => cmdDeviceList({ argv: a, sessionName: globals.session, io }),
          boot: (a) => cmdDeviceBoot({ argv: a, sessionName: globals.session, io }),
          shutdown: (a) => cmdDeviceShutdown({ argv: a, sessionName: globals.session, io }),
          erase: (a) => cmdDeviceErase({ argv: a, sessionName: globals.session, io }),
          screenshot: (a) => cmdDeviceScreenshot({ argv: a, sessionName: globals.session, io }),
        }),
      app: async (args) =>
        group("app", args, {
          "build-ios": (a) => cmdAppBuildIOS({ argv: a, sessionName: globals.session, io }),
          install: (a) => cmdAppInstall({ argv: a, sessionName: globals.session, io }),
          uninstall: (a) => cmdAppUninstall({ argv: a, sessionName: globals.session, io }),
          launch: (a) => cmdAppLaunch({ argv: a, sessionName: globals.session, io }),
          terminate: (a) => cmdAppTerminate({ argv: a, sessionName: globals.session, io }),
          id: (a) => cmdAppId({ argv: a, sessionName: globals.session, io }),
        }),
      ui: async (args) => {
        const [sub, ...subArgs] = args;
        if (!sub) throw new CLIError("ui requires a subcommand", { exitCode: 2 });
        if (sub === "snapshot") return await runAndExit(cmdUiSnapshot({ argv: subArgs, sessionName: globals.session, io }));
        if (sub === "tap") return await runAndExit(cmdUiTap({ argv: subArgs, sessionName: globals.session, io, selectorToken: null }));
        if (sub === "type") {
          const { positionals, rest: optArgs } = splitPositionalPrefix(subArgs);
          if (positionals.length === 0) throw new CLIError('ui type requires a "<text>" argument', { exitCode: 2 });
          return await runAndExit(cmdUiType({ argv: optArgs, sessionName: globals.session, io, textArgs: positionals }));
        }
        if (sub === "press") {
          const { positionals, rest: optArgs } = splitPositionalPrefix(subArgs);
          const key = positionals[0];
          if (!key) throw new CLIError("ui press requires <key>", { exitCode: 2 });
          return await runAndExit(cmdUiPress({ argv: optArgs, sessionName: globals.session, io, key }));
        }
        if (sub === "swipe") {
          const { positionals, rest: optArgs } = splitPositionalPrefix(subArgs);
          const dir = positionals[0];
          if (!dir) throw new CLIError("ui swipe requires <direction|coords>", { exitCode: 2 });
          return await runAndExit(cmdUiSwipe({ argv: optArgs, sessionName: globals.session, io, directionOrCoords: dir }));
        }
        if (sub === "assert-visible" || sub === "assert-not-visible") {
          const { positionals, rest: optArgs } = splitPositionalPrefix(subArgs);
          const query = positionals.join(" ");
          if (!query) throw new CLIError(`ui ${sub} requires a "<query>" argument`, { exitCode: 2 });
          return await runAndExit(
            cmdUiAssertVisible({ argv: optArgs, sessionName: globals.session, io, query, negate: sub === "assert-not-visible" })
          );
        }
        if (sub === "find") {
          if (subArgs.length === 0) throw new CLIError("ui find requires <action>", { exitCode: 2 });
          const action = subArgs[subArgs.length - 1]!;
          const optArgs = subArgs.slice(0, -1);
          return await runAndExit(cmdUiFind({ argv: optArgs, sessionName: globals.session, io, action }));
        }
        throw new CLIError(`Unknown ui subcommand: ${sub}`, { exitCode: 2 });
      },
      flow: async (args) =>
        group("flow", args, {
          run: (a) => cmdFlowRun({ argv: a, sessionName: globals.session, io }),
        }),
      logs: async (args) =>
        group("logs", args, {
          tail: (a) => cmdLogsTail({ argv: a, sessionName: globals.session, io }),
        }),
      live: async (args) =>
        group("live", args, {
          start: (a) => cmdLiveStart({ argv: a, sessionName: globals.session, io }),
          status: (a) => cmdLiveStatus({ argv: a, sessionName: globals.session, io }),
          stop: (a) => cmdLiveStop({ argv: a, sessionName: globals.session, io }),
        }),
    };

    const handler = commands[commandRaw];
    if (!handler) throw new CLIError(`Unknown command: ${commandRaw}`, { exitCode: 2 });
    await handler(argsRaw);
    return;
  } catch (err) {
    const normalized = normalizeError(err);
    const exitCode = getExitCode(err);
    const commandName = deriveCommandName(rest);
    const durationMs = Date.now() - startedAt.getTime();
    const details = [...normalized.details];
    if (globals.verbose && err instanceof Error && err.stack) {
      const lines = err.stack.split("\n").slice(0, 12).map((l) => l.trim()).filter(Boolean);
      details.push(...lines.map((l) => `Stack: ${l}`));
    }

    if (io.config.mode === "human" && !io.config.quiet) {
      io.error([`Error: ${normalized.message}`, ...details]);
      if (exitCode === 2) io.error("");
      if (exitCode === 2) printHelp("");
    }

    // For structured modes, command handlers typically emit a structured envelope.
    // If we got here, we didn't manage to.
    if (io.config.mode !== "human") {
      io.result({
        ok: false,
        version: getVersionString(),
        command: { name: commandName, argv: rest },
        session: globals.session,
        platform: null,
        timing: { started_at: startedAt.toISOString(), duration_ms: durationMs },
        run_dir: null,
        target: { device: null, app: null },
        artifacts: [],
        data: {},
        error: { code: normalized.code, message: normalized.message, details },
        next_steps: [],
      });
    }

    process.exitCode = exitCode;
  }
}
