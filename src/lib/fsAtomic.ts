import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function atomicWriteFile(filePath: string, content: string, encoding: BufferEncoding = "utf8"): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.tmp.${crypto.randomBytes(6).toString("hex")}`);
  await fs.writeFile(tmp, content, encoding);
  await fs.rename(tmp, filePath);
}

