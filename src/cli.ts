import process from "node:process";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdDevicesList } from "./commands/devices.js";
import { cmdDeviceBoot } from "./commands/deviceBoot.js";
import { cmdBuildIOS } from "./commands/buildIos.js";
import { cmdInstallApp } from "./commands/installApp.js";
import { cmdTest } from "./commands/test.js";
import { cmdDeviceScreenshot } from "./commands/deviceScreenshot.js";
import { cmdFlowRun } from "./commands/flowRun.js";
import { cmdStudio } from "./commands/studio.js";

function usage(): string {
  return [
    "mobile-dev-agent - Agent-friendly wrapper around Maestro + mobile simulator/emulator tooling",
    "",
    "Usage:",
    "  mobile-dev-agent doctor [--json]",
    "  mobile-dev-agent devices list [--platform ios|android|all] [--json]",
    "  mobile-dev-agent device boot (--udid <id> | --name <device-name>) [--wait] [--json]",
    "  mobile-dev-agent device boot --platform android --avd <name> [--wait] [--headless] [--json]",
    "  mobile-dev-agent device screenshot [--platform ios|android] [--udid <id> | --name <device-name> | --device <id>]",
    "                     [--out <path>] [--json]",
    "  mobile-dev-agent build-ios (--project <.xcodeproj> | --workspace <.xcworkspace>) --scheme <scheme>",
    "                     [--configuration Debug] [--destination <alias|xcode-destination>] [--derived-data <dir>]",
    "                     [--json] [--verbose]",
    "  mobile-dev-agent app install --app <path-to-.app|.apk> [--platform ios|android] [--udid <id> | --name <device-name> | --device <id>]",
    "                     [--boot] [--json]",
    "  mobile-dev-agent test --flow <path> [--platform ios|android] [--udid <id> | --name <device-name> | --device <id>]",
    "               [--boot] [--app <path-to-.app|.apk>] [--format junit|html] [--output <path>]",
    "               [--maestro-output-dir <dir>] [--test-output-dir <dir>] [--debug-output <dir>]",
    "               [--env KEY=VALUE ...] [--json] [--verbose]",
    "  mobile-dev-agent flow run [--platform ios|android] [--udid <id> | --name <device-name> | --device <id>]",
    "               [--app-id <bundle>] [--app <path-to-.app|.apk>] [--out-dir <dir>]",
    "               [--format junit|html] [--output <path>] [--test-output-dir <dir>] [--debug-output <dir>]",
    "               [--env KEY=VALUE ...] [--json] [--verbose]",
    "  mobile-dev-agent studio [--platform ios|android] [--device <id>]",
    "",
    "Notes:",
    "  - Maestro uses simulators/emulators; physical devices are not supported by this wrapper.",
    "  - This tool invokes `maestro`, `xcrun simctl`, `xcodebuild`, and `adb` as needed.",
    "  - build-ios --destination supports aliases: iphone, iphone-latest, ipad, booted, available, or a full xcodebuild destination string.",
  ].join("\n");
}

function isHelpToken(token: string): boolean {
  return token === "-h" || token === "--help" || token === "help";
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (!command || isHelpToken(command)) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = command ? 0 : 2;
    return;
  }

  switch (command) {
    case "doctor":
      await cmdDoctor(rest);
      return;
    case "devices": {
      const [sub, ...subArgs] = rest;
      if (sub === "list") {
        await cmdDevicesList(subArgs);
        return;
      }
      break;
    }
    case "device": {
      const [sub, ...subArgs] = rest;
      if (sub === "boot") {
        await cmdDeviceBoot(subArgs);
        return;
      }
      if (sub === "screenshot") {
        await cmdDeviceScreenshot(subArgs);
        return;
      }
      break;
    }
    case "build-ios":
      await cmdBuildIOS(rest);
      return;
    case "app": {
      const [sub, ...subArgs] = rest;
      if (sub === "install") {
        await cmdInstallApp(subArgs);
        return;
      }
      break;
    }
    case "test":
      await cmdTest(rest);
      return;
    case "flow": {
      const [sub, ...subArgs] = rest;
      if (sub === "run") {
        await cmdFlowRun(subArgs);
        return;
      }
      break;
    }
    case "studio":
      await cmdStudio(rest);
      return;
    default:
      break;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${usage()}\n`);
  process.exitCode = 2;
}
