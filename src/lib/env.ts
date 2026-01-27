export function parseEnvList(envList: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of envList) {
    const idx = item.indexOf("=");
    if (idx === -1) {
      throw new Error(`Invalid --env entry (expected KEY=VALUE): ${item}`);
    }
    const key = item.slice(0, idx).trim();
    const val = item.slice(idx + 1);
    if (!key) throw new Error(`Invalid --env entry (empty key): ${item}`);
    out[key] = val;
  }
  return out;
}
