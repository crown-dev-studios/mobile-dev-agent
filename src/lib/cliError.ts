export type CLIErrorOptions = {
  exitCode: number;
  code?: string;
  details?: string[];
};

export class CLIError extends Error {
  exitCode: number;
  code: string;
  details: string[];

  constructor(message: string, { exitCode, code, details = [] }: CLIErrorOptions) {
    super(message);
    this.exitCode = exitCode;
    this.code = code ?? (exitCode === 2 ? "USAGE" : exitCode === 127 ? "DEPENDENCY_MISSING" : "FAILED");
    this.details = details;
  }
}

export function usageError(message: string, details: string[] = []): CLIError {
  return new CLIError(message, { exitCode: 2, code: "USAGE", details });
}

export function dependencyError(message: string, details: string[] = []): CLIError {
  return new CLIError(message, { exitCode: 127, code: "DEPENDENCY_MISSING", details });
}
