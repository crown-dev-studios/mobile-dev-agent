import { usageError } from "./cliError.js";
import type { Platform } from "./deviceResolver.js";

export function parsePlatform(value: unknown, { defaultValue = "ios" }: { defaultValue?: Platform } = {}): Platform {
  const v = String(value ?? "").trim().toLowerCase();
  const out = (v || defaultValue) as Platform;
  if (out !== "ios" && out !== "android") {
    throw usageError(`Invalid --platform: ${value} (expected ios or android)`);
  }
  return out;
}

export function parsePlatformOrAll(
  value: unknown,
  { defaultValue = "all" }: { defaultValue?: "ios" | "android" | "all" } = {}
): "ios" | "android" | "all" {
  const v = String(value ?? "").trim().toLowerCase();
  const out = (v || defaultValue) as "ios" | "android" | "all";
  if (out !== "ios" && out !== "android" && out !== "all") {
    throw usageError(`Invalid --platform: ${value} (expected ios, android, or all)`);
  }
  return out;
}

