import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "./exec.js";
import { dependencyError } from "./cliError.js";

function parseCFBundleIdentifierFromXML(xml: string): string | null {
  const keyIdx = xml.indexOf("<key>CFBundleIdentifier</key>");
  if (keyIdx === -1) return null;
  const after = xml.slice(keyIdx);
  const m = after.match(/<string>([^<]+)<\/string>/);
  return m?.[1]?.trim() || null;
}

async function extractIOSAppId(appPath: string): Promise<string> {
  const infoPlist = path.join(appPath, "Info.plist");
  const buf = await fs.readFile(infoPlist);

  if (buf.slice(0, 6).toString("utf8") !== "bplist") {
    const text = buf.toString("utf8");
    const fromXml = parseCFBundleIdentifierFromXML(text);
    if (fromXml) return fromXml;
  }

  // Binary plist (or XML parse failed): try plutil -> json.
  const res = await execFile("plutil", ["-convert", "json", "-o", "-", infoPlist], { timeoutMs: 15000 });
  if (!res.ok) {
    if (res.code === null) {
      throw dependencyError("Missing dependency: plutil (required to read binary Info.plist).", [
        "Install Xcode Command Line Tools (`xcode-select --install`) or run on macOS with plutil available.",
      ]);
    }
    throw new Error(`plutil failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
  const json = JSON.parse(res.stdout) as { CFBundleIdentifier?: unknown };
  const id = json.CFBundleIdentifier;
  if (typeof id === "string" && id.trim()) return id.trim();
  throw new Error("Could not extract CFBundleIdentifier from Info.plist.");
}

async function extractAndroidAppId(apkPath: string): Promise<string> {
  const res = await execFile("aapt", ["dump", "badging", apkPath], { timeoutMs: 15000 });
  if (!res.ok) {
    if (res.code === null) {
      throw dependencyError("Missing dependency: aapt (Android build-tools).", [
        "Install Android SDK Build-Tools and ensure `aapt` is on PATH.",
      ]);
    }
    throw new Error(`aapt failed (code=${res.code}): ${res.stderr || res.stdout}`.trim());
  }
  const line = (res.stdout || "")
    .split(/\r?\n/)
    .find((l) => l.startsWith("package:")) ?? "";
  const m = line.match(/name='([^']+)'/);
  const id = m?.[1]?.trim();
  if (!id) throw new Error("Could not extract package name from aapt output.");
  return id;
}

export async function extractAppId(appPath: string): Promise<{ platform: "ios" | "android"; appId: string }> {
  if (appPath.endsWith(".app")) {
    return { platform: "ios", appId: await extractIOSAppId(appPath) };
  }
  if (appPath.endsWith(".apk")) {
    return { platform: "android", appId: await extractAndroidAppId(appPath) };
  }
  throw new Error(`Unsupported --app path (expected .app or .apk): ${appPath}`);
}

