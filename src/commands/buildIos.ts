import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { printHuman, printJSON } from "../lib/format.js";
import { resolveIOSDestination } from "../lib/simctl.js";
import { buildXcodebuildArgs, findBuiltApps, pickSingleApp, runXcodebuild } from "../lib/xcodebuild.js";

type BuildIOSArgs = {
  project?: string;
  workspace?: string;
  scheme?: string;
  configuration?: string;
  destination?: string;
  "derived-data"?: string;
  json?: boolean;
  verbose?: boolean;
};

export async function cmdBuildIOS(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      workspace: { type: "string" },
      scheme: { type: "string" },
      configuration: { type: "string", default: "Debug" },
      destination: { type: "string", default: "" },
      "derived-data": { type: "string" },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: BuildIOSArgs };

  if (!values.project && !values.workspace) {
    throw new Error("build-ios requires --project <.xcodeproj> or --workspace <.xcworkspace>");
  }
  if (!values.scheme) {
    throw new Error("build-ios requires --scheme <scheme>");
  }

  const derivedData =
    values["derived-data"] ||
    path.join(os.tmpdir(), "mobile-dev-agent-derived-data", `${values.scheme}-${Date.now()}`);
  await fs.mkdir(derivedData, { recursive: true });

  const destinationInput = values.destination?.trim() || undefined;
  const { destination } = await resolveIOSDestination(destinationInput);
  const args = buildXcodebuildArgs({
    project: values.project,
    workspace: values.workspace,
    scheme: values.scheme,
    configuration: values.configuration,
    destination,
    derivedData,
  });

  const stream = values.verbose ? (values.json ? "stderr" : true) : false;
  await runXcodebuild(args, { stream });

  const apps = await findBuiltApps({ derivedData, configuration: values.configuration });
  const picked = pickSingleApp(apps, { scheme: values.scheme });
  if (!picked.ok) {
    const result = { ok: false, derivedData, apps, error: picked.reason };
    if (values.json) {
      printJSON(result);
      process.exitCode = 1;
      return;
    }
    printHuman([`Build completed but could not choose a single .app: ${picked.reason}`, `DerivedData: ${derivedData}`]);
    process.exitCode = 1;
    return;
  }

  const result = {
    ok: true,
    derivedData,
    appPath: picked.appPath,
    destination,
    configuration: values.configuration,
  };
  if (values.json) {
    printJSON(result);
    return;
  }

  printHuman([`Built .app: ${picked.appPath}`, `DerivedData: ${derivedData}`]);
}
