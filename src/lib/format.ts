export function printJSON(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printHuman(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function printError(lines: string[] | string): void {
  const payload = Array.isArray(lines) ? lines.join("\n") : lines;
  process.stderr.write(`${payload}\n`);
}
