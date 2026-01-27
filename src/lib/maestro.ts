export type MaestroTestArgs = {
  flowPath: string;
  device?: string;
  format?: string;
  output?: string;
  testOutputDir?: string;
  debugOutput?: string;
};

export function buildMaestroTestArgs({
  flowPath,
  device,
  format,
  output,
  testOutputDir,
  debugOutput,
}: MaestroTestArgs): string[] {
  const args = [];
  if (device) args.push("--device", device);
  args.push("test");
  if (format) args.push("--format", format);
  if (output) args.push("--output", output);
  if (testOutputDir) args.push("--test-output-dir", testOutputDir);
  if (debugOutput) args.push("--debug-output", debugOutput);
  args.push(flowPath);
  return args;
}
