#!/usr/bin/env node
import { main } from "../cli.js";
import { normalizeError, getExitCode, wantsJSON } from "../lib/errors.js";
import { printError, printJSON } from "../lib/format.js";

const argv = process.argv.slice(2);
try {
  await main(argv);
} catch (err) {
  const normalized = normalizeError(err);
  printError([`Error: ${normalized.message}`, ...normalized.details]);
  if (wantsJSON(argv)) {
    printJSON({ ok: false, error: normalized.message, details: normalized.details });
  }
  process.exitCode = getExitCode(err);
}
