export type NormalizedError = {
  message: string;
  details: string[];
};

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    const details: string[] = [];
    if (err.cause instanceof Error) {
      details.push(`Caused by: ${err.cause.message}`);
    }
    return {
      message: err.message || "Unknown error",
      details,
    };
  }
  return { message: String(err), details: [] };
}

export function getExitCode(err: unknown): number {
  if (err && typeof err === "object" && "exitCode" in err) {
    const code = (err as { exitCode?: unknown }).exitCode;
    if (typeof code === "number") return code;
  }
  return 1;
}

export function wantsJSON(argv: string[]): boolean {
  return argv.includes("--json");
}
