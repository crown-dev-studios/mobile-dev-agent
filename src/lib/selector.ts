import { usageError } from "./cliError.js";
import type { CanonicalElement, UISnapshot } from "./uiSnapshot.js";

export type ParsedSelector =
  | { kind: "ref"; ref: string }
  | { kind: "coords"; x: number; y: number }
  | { kind: "text"; text: string }
  | { kind: "id"; id: string };

export function parseSelectorToken(token: string): ParsedSelector {
  const t = token.trim();
  if (!t) throw usageError("Empty selector");

  if (t.startsWith("@")) {
    const ref = t.slice(1);
    if (!/^e\d+$/.test(ref)) throw usageError(`Invalid ref selector: ${token}`);
    return { kind: "ref", ref };
  }

  if (t.startsWith("coords:")) {
    const parts = t.slice("coords:".length).split(",");
    if (parts.length !== 2) throw usageError(`Invalid coords selector: ${token}`);
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw usageError(`Invalid coords selector: ${token}`);
    return { kind: "coords", x, y };
  }

  if (t.startsWith("text:")) {
    const v = stripQuotes(t.slice("text:".length).trim());
    if (!v) throw usageError(`Invalid text selector: ${token}`);
    return { kind: "text", text: v };
  }

  if (t.startsWith("id:")) {
    const v = stripQuotes(t.slice("id:".length).trim());
    if (!v) throw usageError(`Invalid id selector: ${token}`);
    return { kind: "id", id: v };
  }

  throw usageError(`Unknown selector: ${token}`);
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export type ResolvedTapTarget =
  | { kind: "coords"; x: number; y: number }
  | { kind: "element"; element: CanonicalElement; x: number; y: number };

export function elementCenter(el: CanonicalElement): { x: number; y: number } {
  const { x, y, w, h } = el.bounds;
  return { x: Math.round(x + w / 2), y: Math.round(y + h / 2) };
}

export function resolveTapTarget(snapshot: UISnapshot, selector: ParsedSelector): ResolvedTapTarget {
  if (selector.kind === "coords") {
    return { kind: "coords", x: selector.x, y: selector.y };
  }

  let el: CanonicalElement | null = null;
  if (selector.kind === "ref") {
    el = snapshot.refs[selector.ref] ?? null;
  } else if (selector.kind === "text") {
    el = snapshot.elements.find((e) => e.name === selector.text) ?? null;
  } else if (selector.kind === "id") {
    const id = selector.id;
    el =
      snapshot.elements.find((e) => e.selectors.ios.id === id || e.selectors.ios.label === id) ??
      snapshot.elements.find((e) => e.selectors.android.resource_id === id) ??
      snapshot.elements.find((e) => e.selectors.android.content_desc === id) ??
      null;
  }

  if (!el) throw usageError(`No matching element for selector: ${formatSelector(selector)}`);
  const { x, y } = elementCenter(el);
  return { kind: "element", element: el, x, y };
}

function formatSelector(selector: ParsedSelector): string {
  if (selector.kind === "ref") return `@${selector.ref}`;
  if (selector.kind === "coords") return `coords:${selector.x},${selector.y}`;
  if (selector.kind === "text") return `text:${JSON.stringify(selector.text)}`;
  if (selector.kind === "id") return `id:${JSON.stringify(selector.id)}`;
  return "unknown";
}

