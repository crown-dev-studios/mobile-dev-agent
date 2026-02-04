import crypto from "node:crypto";

export type Bounds = { x: number; y: number; w: number; h: number };
export type ElementStates = { enabled: boolean; visible: boolean; focused: boolean; checked: boolean };

export type CanonicalElement = {
  ref: string;
  role: string;
  name: string;
  value: string | null;
  bounds: Bounds;
  states: ElementStates;
  selectors: {
    ios: { id: string | null; label: string | null };
    android: { resource_id: string | null; content_desc: string | null; class: string | null };
  };
};

export type UISnapshot = {
  snapshot_id: string;
  taken_at: string;
  platform: "ios" | "android";
  device_id: string | null;
  app_id: string | null;
  tree: string;
  elements: CanonicalElement[];
  refs: Record<string, CanonicalElement>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isUISnapshot(value: unknown): value is UISnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.snapshot_id !== "string" || !value.snapshot_id) return false;
  if (typeof value.taken_at !== "string" || !value.taken_at) return false;
  if (value.platform !== "ios" && value.platform !== "android") return false;
  if (value.device_id !== null && typeof value.device_id !== "string") return false;
  if (value.app_id !== null && typeof value.app_id !== "string") return false;
  if (typeof value.tree !== "string") return false;
  if (!Array.isArray(value.elements)) return false;
  if (!isRecord(value.refs)) return false;
  return true;
}

const INTERACTABLE_ROLES = new Set(["button", "textbox", "link", "checkbox", "switch"]);

function nonZeroBounds(b: Bounds): boolean {
  return b.w > 0 && b.h > 0;
}

function defaultStates(): ElementStates {
  return { enabled: true, visible: true, focused: false, checked: false };
}

export function assignRefs(elements: Omit<CanonicalElement, "ref">[]): { elements: CanonicalElement[]; refs: Record<string, CanonicalElement> } {
  const out: CanonicalElement[] = [];
  const refs: Record<string, CanonicalElement> = {};
  for (let i = 0; i < elements.length; i += 1) {
    const ref = `e${i + 1}`;
    const el: CanonicalElement = { ...elements[i], ref };
    out.push(el);
    refs[ref] = el;
  }
  return { elements: out, refs };
}

export function renderTree(elements: CanonicalElement[]): string {
  return elements
    .map((e) => {
      const b = e.bounds;
      const label = e.name ? JSON.stringify(e.name) : "\"\"";
      return `@${e.ref} [${e.role}] ${label} (${b.x},${b.y},${b.w},${b.h})`;
    })
    .join("\n");
}

export function buildSnapshot({
  platform,
  deviceId,
  appId,
  elements,
}: {
  platform: "ios" | "android";
  deviceId: string | null;
  appId: string | null;
  elements: Omit<CanonicalElement, "ref">[];
}): UISnapshot {
  const assigned = assignRefs(elements);
  const tree = renderTree(assigned.elements);
  return {
    snapshot_id: crypto.randomUUID(),
    taken_at: new Date().toISOString(),
    platform,
    device_id: deviceId,
    app_id: appId,
    tree,
    elements: assigned.elements,
    refs: assigned.refs,
  };
}

function toBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return defaultValue;
}

function toNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : defaultValue;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }
  return defaultValue;
}

function mapIOSRole(raw: string): string {
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower.includes("button")) return "button";
  if (lower.includes("textfield") || lower.includes("text field") || lower.includes("textview") || lower.includes("text view"))
    return "textbox";
  if (lower.includes("link")) return "link";
  if (lower.includes("checkbox")) return "checkbox";
  if (lower.includes("switch")) return "switch";
  return lower.replace(/\s+/g, "_") || "unknown";
}

function extractBounds(obj: Record<string, unknown>): Bounds {
  const frame = (obj.frame && typeof obj.frame === "object" ? (obj.frame as Record<string, unknown>) : null) ?? null;
  const bounds = (obj.bounds && typeof obj.bounds === "object" ? (obj.bounds as Record<string, unknown>) : null) ?? null;
  const rect = (obj.rect && typeof obj.rect === "object" ? (obj.rect as Record<string, unknown>) : null) ?? null;

  const pick = frame ?? bounds ?? rect;
  if (pick) {
    const x = toNumber(pick.x, toNumber(pick.left, 0));
    const y = toNumber(pick.y, toNumber(pick.top, 0));
    const w = toNumber(pick.w, toNumber(pick.width, toNumber(pick.right, 0) - x));
    const h = toNumber(pick.h, toNumber(pick.height, toNumber(pick.bottom, 0) - y));
    return { x, y, w, h };
  }

  return { x: 0, y: 0, w: 0, h: 0 };
}

function getFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function maybeCanonicalIOS(obj: Record<string, unknown>): Omit<CanonicalElement, "ref"> | null {
  const roleRaw =
    getFirstString(obj, ["role", "AXRole", "type", "elementType", "class", "AXElementType"]) ??
    (typeof obj.traits === "string" ? obj.traits : null);
  const name = getFirstString(obj, ["name", "label", "AXLabel", "title", "identifier", "valueLabel"]);
  const id = getFirstString(obj, ["id", "identifier", "AXIdentifier", "accessibilityIdentifier"]);
  const label = getFirstString(obj, ["label", "AXLabel", "title", "accessibilityLabel", "name"]);
  const value = getFirstString(obj, ["value", "AXValue", "valueLabel"]);

  if (!roleRaw && !name && !label && !id) return null;

  const role = roleRaw ? mapIOSRole(roleRaw) : "unknown";
  const bounds = extractBounds(obj);

  const states: ElementStates = {
    enabled: toBool(obj.enabled, true),
    visible: toBool(obj.visible, true),
    focused: toBool(obj.focused, false),
    checked: toBool(obj.checked, toBool(obj.selected, false)),
  };

  return {
    role,
    name: (name ?? label ?? id ?? "").trim(),
    value: value ?? null,
    bounds,
    states,
    selectors: {
      ios: { id: id ?? null, label: label ?? null },
      android: { resource_id: null, content_desc: null, class: null },
    },
  };
}

function walkAny(value: unknown, visitor: (obj: Record<string, unknown>) => void): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) walkAny(item, visitor);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  visitor(obj);

  for (const key of ["children", "elements", "nodes", "subviews", "descendants"]) {
    if (key in obj) walkAny(obj[key], visitor);
  }
}

export function parseIOSAxeDescribeUI(raw: unknown, { interactiveOnly }: { interactiveOnly: boolean }): Omit<CanonicalElement, "ref">[] {
  const candidates: Omit<CanonicalElement, "ref">[] = [];
  walkAny(raw, (obj) => {
    const el = maybeCanonicalIOS(obj);
    if (el) candidates.push(el);
  });

  // De-dupe very similar elements (common in recursive dumps).
  const seen = new Set<string>();
  const deduped = candidates.filter((e) => {
    const key = `${e.role}|${e.name}|${e.selectors.ios.id ?? ""}|${e.bounds.x},${e.bounds.y},${e.bounds.w},${e.bounds.h}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!interactiveOnly) return deduped;
  return deduped.filter((e) => INTERACTABLE_ROLES.has(e.role) && nonZeroBounds(e.bounds));
}

function parseAndroidBounds(bounds: string): Bounds {
  const m = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!m) return { x: 0, y: 0, w: 0, h: 0 };
  const l = Number(m[1]);
  const t = Number(m[2]);
  const r = Number(m[3]);
  const b = Number(m[4]);
  return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) };
}

function mapAndroidRole(className: string): string {
  if (className === "android.widget.Button") return "button";
  if (className === "android.widget.EditText") return "textbox";
  if (className === "android.widget.CheckBox") return "checkbox";
  if (className === "android.widget.Switch") return "switch";
  return "unknown";
}

function attrMap(attrText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w:-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(attrText))) {
    out[m[1]] = m[2];
  }
  return out;
}

export function parseAndroidUiautomatorXml(xml: string, { interactiveOnly }: { interactiveOnly: boolean }): Omit<CanonicalElement, "ref">[] {
  const nodes: Omit<CanonicalElement, "ref">[] = [];
  const re = /<node\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(xml))) {
    const attrs = attrMap(m[1] ?? "");
    const className = attrs.class ?? "";
    const boundsRaw = attrs.bounds ?? "";
    const bounds = parseAndroidBounds(boundsRaw);

    const text = attrs.text?.trim() ?? "";
    const contentDesc = attrs["content-desc"]?.trim() ?? "";
    const resourceId = attrs["resource-id"]?.trim() ?? "";

    const name =
      text ||
      contentDesc ||
      (resourceId ? resourceId.split("/").pop() ?? resourceId : "") ||
      className.split(".").pop() ||
      "";

    const role = mapAndroidRole(className);
    const clickable = attrs.clickable === "true";
    const focusable = attrs.focusable === "true";
    const interactable = clickable || focusable || INTERACTABLE_ROLES.has(role);

    const states: ElementStates = {
      ...defaultStates(),
      enabled: attrs.enabled !== "false",
      visible: attrs["visible-to-user"] !== "false",
      focused: attrs.focused === "true",
      checked: attrs.checked === "true",
    };

	    const element: Omit<CanonicalElement, "ref"> = {
	      role,
	      name,
	      value: null,
	      bounds,
	      states,
	      selectors: {
	        ios: { id: null, label: null },
	        android: { resource_id: resourceId || null, content_desc: contentDesc || null, class: className || null },
	      },
	    };

    if (interactiveOnly) {
      if (!interactable) continue;
      if (!nonZeroBounds(bounds)) continue;
    }

    nodes.push(element);
  }

  return nodes;
}
