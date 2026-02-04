import process from "node:process";
import { printHuman, printJSON, printError } from "./format.js";
import type { ResultEnvelope } from "./envelope.js";
import type { JsonlEvent, JsonlResult, RunContext } from "./run.js";

export type OutputMode = "human" | "json" | "jsonl";

export type OutputConfig = {
  mode: OutputMode;
  quiet: boolean;
  verbose: boolean;
};

function writeJSONLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export class CommandIO {
  config: OutputConfig;
  run: RunContext | null = null;

  constructor(config: OutputConfig) {
    this.config = config;
  }

  attachRun(run: RunContext): void {
    this.run = run;
  }

  event(event: JsonlEvent): void {
    if (this.config.mode === "jsonl") {
      writeJSONLine(event);
    }
  }

  human(lines: string[]): void {
    if (this.config.mode !== "human") return;
    if (this.config.quiet) return;
    printHuman(lines);
  }

  error(lines: string[] | string): void {
    if (this.config.mode !== "human") return;
    if (this.config.quiet) return;
    printError(lines);
  }

  result(envelope: ResultEnvelope): void {
    if (this.config.mode === "json") {
      printJSON(envelope);
      return;
    }
    if (this.config.mode === "jsonl") {
      const resultLine: JsonlResult<ResultEnvelope> = { type: "result", ...envelope };
      writeJSONLine(resultLine);
      return;
    }
    // human mode: commands decide what to print; still return nothing.
  }
}

