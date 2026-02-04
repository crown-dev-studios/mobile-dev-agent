#!/usr/bin/env node
import { main } from "../cli.js";
import { normalizeError, getExitCode } from "../lib/errors.js";
import { printError } from "../lib/format.js";

const argv = process.argv.slice(2);
try {
  await main(argv);
} catch (err) {
  const normalized = normalizeError(err);
  printError([`Error: ${normalized.message}`, ...normalized.details]);
  process.exitCode = getExitCode(err);
}
