import { createRequire } from "node:module";

type PackageJSON = { name?: string; version?: string };

export function getVersionString(): string {
  try {
    const require = createRequire(import.meta.url);
    // dist/src/lib -> ../../../package.json
    const pkg = require("../../../package.json") as PackageJSON;
    const name = pkg.name || "mobile-dev-agent";
    const version = pkg.version || "0.0.0";
    return `${name}@${version}`;
  } catch {
    return "mobile-dev-agent@unknown";
  }
}

