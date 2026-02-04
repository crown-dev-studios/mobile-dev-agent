export type NormalizedError = {
  code: string;
  message: string;
  details: string[];
};

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    const details: string[] = [];
    let code = "FAILED";
    if ("code" in err && typeof (err as { code?: unknown }).code === "string" && (err as { code: string }).code.trim()) {
      code = (err as { code: string }).code;
    } else if ("exitCode" in err && typeof (err as { exitCode?: unknown }).exitCode === "number") {
      const exitCode = (err as { exitCode: number }).exitCode;
      code = exitCode === 2 ? "USAGE" : exitCode === 127 ? "DEPENDENCY_MISSING" : "FAILED";
    }
    if ("details" in err && Array.isArray((err as { details?: unknown }).details)) {
      for (const d of (err as { details: unknown[] }).details) {
        if (typeof d === "string" && d.trim()) details.push(d);
      }
    }
    if (err.cause instanceof Error) {
      details.push(`Caused by: ${err.cause.message}`);
    }
    return {
      code,
      message: err.message || "Unknown error",
      details,
    };
  }
  return { code: "FAILED", message: String(err), details: [] };
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
