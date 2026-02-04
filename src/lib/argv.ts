import { usageError } from "./cliError.js";
import { validateSessionName } from "./sessionName.js";
import { getSessionsDir } from "./dirs.js";

export type GlobalArgs = {
  session: string;
  json: boolean;
  jsonl: boolean;
  quiet: boolean;
  verbose: boolean;
  help: boolean;
};

export type ParsedGlobal = {
  globals: GlobalArgs;
  rest: string[];
};

function isFlag(token: string): boolean {
  return token.startsWith("-");
}

function splitFlag(token: string): { key: string; value: string | null } {
  const idx = token.indexOf("=");
  if (idx === -1) return { key: token, value: null };
  return { key: token.slice(0, idx), value: token.slice(idx + 1) };
}

export function parseGlobalArgs(argv: string[]): ParsedGlobal {
  const globals: GlobalArgs = {
    session: "default",
    json: false,
    jsonl: false,
    quiet: false,
    verbose: false,
    help: false,
  };

  const rest: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (!isFlag(token)) {
      rest.push(token);
      continue;
    }

    const { key, value } = splitFlag(token);
    if (key === "--session") {
      const v = value ?? argv[i + 1];
      if (v == null) throw usageError("--session requires a value");
      globals.session = validateSessionName(v, getSessionsDir());
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
      // Keep the value token as well to preserve argv shape.
      // This is important for flags like `--ref e12` that are command-specific.
      const next = argv[i + 1];
      if (next != null) rest.push(next);
      i += 1;
    }
  }

  if (globals.json && globals.jsonl) {
    throw usageError("Use only one of --json or --jsonl");
  }

  return { globals, rest };
}
