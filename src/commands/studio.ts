import { parseArgs } from "node:util";
import { execFile } from "../lib/exec.js";
import { printJSON } from "../lib/format.js";
import { resolveIOSSimulator } from "../lib/simctl.js";
import { adbListDevices } from "../lib/android.js";

type StudioArgs = {
  platform?: string;
  udid?: string;
  name?: string;
  device?: string;
  "debug-output"?: string;
  "no-window"?: boolean;
  json?: boolean;
};

export async function cmdStudio(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      platform: { type: "string", default: "ios" },
      udid: { type: "string" },
      name: { type: "string" },
      device: { type: "string" },
      "debug-output": { type: "string", default: "" },
      "no-window": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as { values: StudioArgs };

  const platform = String(values.platform || "ios").toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    throw new Error(`Invalid --platform: ${values.platform} (expected ios or android)`);
  }

  let deviceId = values.device;
  if (platform === "ios") {
    if (!deviceId && (values.udid || values.name)) {
      const device = await resolveIOSSimulator({ udid: values.udid, name: values.name, bootIfNeeded: false });
      deviceId = device.udid;
    }
  } else if (!deviceId) {
    const devices = await adbListDevices();
    const chosen = devices.find((d) => d.state === "device") ?? devices[0];
    if (chosen) deviceId = chosen.id;
  }

  const args = [];
  if (deviceId) args.push("--device", deviceId);
  args.push("studio");
  if (values["debug-output"]) args.push("--debug-output", values["debug-output"]);
  if (values["no-window"]) args.push("--no-window");

  if (values.json) {
    printJSON({ ok: true, command: ["maestro", ...args].join(" ") });
    process.exitCode = 0;
    return;
  }

  const res = await execFile("maestro", args, { stream: true });
  process.exitCode = res.ok ? 0 : res.code ?? 1;
}
