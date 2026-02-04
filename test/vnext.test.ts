import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { getHelpText, HELP_CANON } from "../src/helpCanon.js";
import { buildSnapshot, parseAndroidUiautomatorXml, parseIOSAxeDescribeUI } from "../src/lib/uiSnapshot.js";
import { parseSelectorToken, resolveTapTarget } from "../src/lib/selector.js";

test("help canon map matches plans/CLI_HELP_CANON.md", async () => {
  const mdPath = path.resolve("plans/CLI_HELP_CANON.md");
  const md = await fs.readFile(mdPath, "utf8");

  const parsed: Record<string, string> = {};
  const re = /^##\s+`([^`]+)`\s*\n\s*\n```\n([\s\S]*?)\n```/gm;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(md))) {
    const fullCmd = m[1];
    const block = m[2] + "\n";
    let key = fullCmd.replace(/^mobile-dev-agent\s*/, "").replace(/\s*--help\s*$/, "").trim();
    if (key === "--help") key = "";
    parsed[key] = block;
  }

  // Ensure no missing entries.
  for (const [key, text] of Object.entries(parsed)) {
    assert.equal(getHelpText(key), text, `Help text mismatch for key: ${JSON.stringify(key)}`);
  }
  // Ensure no extra entries.
  for (const key of Object.keys(HELP_CANON)) {
    assert.equal(parsed[key] != null, true, `Extra help key not present in canon: ${JSON.stringify(key)}`);
  }
});

test("iOS AXe describe-ui parser supports interactive-only filtering", () => {
  const raw = {
    children: [
      { role: "AXButton", label: "Sign in", id: "btnSignIn", frame: { x: 10, y: 20, width: 100, height: 40 } },
      { role: "AXTextField", label: "Email", id: "txtEmail", frame: { x: 10, y: 80, width: 200, height: 40 } },
      { role: "AXStaticText", label: "Welcome", frame: { x: 10, y: 140, width: 300, height: 20 } },
    ],
  };

  const all = parseIOSAxeDescribeUI(raw, { interactiveOnly: false });
  assert.equal(all.length >= 3, true);

  const interactive = parseIOSAxeDescribeUI(raw, { interactiveOnly: true });
  assert.equal(interactive.length, 2);
  assert.equal(interactive[0].role, "button");
  assert.equal(interactive[0].selectors.ios.id, "btnSignIn");
  assert.equal(interactive[1].role, "textbox");
});

test("Android uiautomator XML parser extracts bounds, roles, selectors", () => {
  const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<hierarchy>\n  <node index="0" text="Sign in" resource-id="com.example:id/sign_in" class="android.widget.Button" clickable="true" focusable="true" enabled="true" focused="false" bounds="[0,0][100,50]" />\n  <node index="1" text="" content-desc="Email" resource-id="com.example:id/email" class="android.widget.EditText" clickable="true" focusable="true" enabled="true" focused="true" bounds="[0,60][200,100]" />\n</hierarchy>\n`;

  const els = parseAndroidUiautomatorXml(xml, { interactiveOnly: true });
  assert.equal(els.length, 2);
  assert.equal(els[0].role, "button");
  assert.equal(els[0].selectors.android.resource_id, "com.example:id/sign_in");
  assert.deepEqual(els[0].bounds, { x: 0, y: 0, w: 100, h: 50 });
  assert.equal(els[1].role, "textbox");
  assert.equal(els[1].selectors.android.content_desc, "Email");
});

test("selector parsing and resolution (ref/text/id/coords)", () => {
  const raw = {
    children: [
      { role: "AXButton", label: "Sign in", id: "btnSignIn", frame: { x: 10, y: 20, width: 100, height: 40 } },
      { role: "AXTextField", label: "Email", id: "txtEmail", frame: { x: 10, y: 80, width: 200, height: 40 } },
    ],
  };
  const elements = parseIOSAxeDescribeUI(raw, { interactiveOnly: false });
  const snapshot = buildSnapshot({ platform: "ios", deviceId: "UDID-123", appId: null, elements });

  const refSel = parseSelectorToken("@e1");
  const refTarget = resolveTapTarget(snapshot, refSel);
  assert.equal(refTarget.kind, "element");
  assert.equal(refTarget.element.ref, "e1");

  const textSel = parseSelectorToken('text:"Sign in"');
  const textTarget = resolveTapTarget(snapshot, textSel);
  assert.equal(textTarget.kind, "element");
  assert.equal(textTarget.element.selectors.ios.id, "btnSignIn");

  const idSel = parseSelectorToken('id:"txtEmail"');
  const idTarget = resolveTapTarget(snapshot, idSel);
  assert.equal(idTarget.kind, "element");
  assert.equal(idTarget.element.name, "Email");

  const coordsSel = parseSelectorToken("coords:50,60");
  const coordsTarget = resolveTapTarget(snapshot, coordsSel);
  assert.equal(coordsTarget.kind, "coords");
  assert.equal(coordsTarget.x, 50);
  assert.equal(coordsTarget.y, 60);
});
