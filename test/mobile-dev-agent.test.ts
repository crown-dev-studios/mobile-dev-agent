import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildMaestroTestArgs } from "../src/lib/maestro.js";
import { buildXcodebuildArgs, pickSingleApp } from "../src/lib/xcodebuild.js";
import { flattenIOSDevices } from "../src/lib/simctl.js";

test("buildMaestroTestArgs constructs expected args", () => {
  assert.deepEqual(
    buildMaestroTestArgs({
      flowPath: "flows/login.yaml",
      device: "UDID-123",
      format: "junit",
      output: "out/report.xml",
    }),
    ["--device", "UDID-123", "test", "--format", "junit", "--output", "out/report.xml", "flows/login.yaml"]
  );
});

test("buildXcodebuildArgs includes required flags", () => {
  const args = buildXcodebuildArgs({
    project: "MyApp.xcodeproj",
    scheme: "MyApp",
    configuration: "Debug",
    destination: "platform=iOS Simulator,name=iPhone 15",
    derivedData: "/tmp/dd",
  });
  assert.ok(args.includes("-project"));
  assert.ok(args.includes("MyApp.xcodeproj"));
  assert.ok(args.includes("-scheme"));
  assert.ok(args.includes("MyApp"));
  assert.ok(args.includes("-sdk"));
  assert.ok(args.includes("iphonesimulator"));
  assert.ok(args.includes("-derivedDataPath"));
  assert.ok(args.includes("/tmp/dd"));
});

test("pickSingleApp prefers scheme-named .app when multiple exist", () => {
  const apps = [
    path.join("/dd/Build/Products/Debug-iphonesimulator", "Foo.app"),
    path.join("/dd/Build/Products/Debug-iphonesimulator", "Bar.app"),
  ];
  const picked = pickSingleApp(apps, { scheme: "Bar" });
  assert.equal(picked.ok, true);
  assert.equal(picked.appPath, apps[1]);
});

test("flattenIOSDevices filters and flattens runtimes", () => {
  const json = {
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
        { name: "iPhone 15", udid: "A", state: "Booted", isAvailable: true },
      ],
      "com.apple.CoreSimulator.SimRuntime.tvOS-18-0": [
        { name: "Apple TV", udid: "B", state: "Shutdown", isAvailable: true },
      ],
    },
  };
  const devices = flattenIOSDevices(json);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].udid, "A");
  assert.equal(devices[0].runtime.includes("iOS"), true);
});
