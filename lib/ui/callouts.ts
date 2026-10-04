/** Callout (`> [!note]`) parsing shared by Live Preview and Reading mode. */

export type CalloutKind = "note" | "tip" | "success" | "warning" | "danger";

const ALIASES: Record<string, CalloutKind> = {
  note: "note", info: "note", abstract: "note", summary: "note", tldr: "note", todo: "note", example: "note", quote: "note", cite: "note",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  warning: "warning", caution: "warning", attention: "warning", question: "warning", help: "warning", faq: "warning",
  danger: "danger", error: "danger", failure: "danger", fail: "danger", missing: "danger", bug: "danger",
};

export function calloutKind(type: string): CalloutKind {
  return ALIASES[type.toLowerCase()] ?? "note";
}

export interface CalloutHeader {
  type: string;
  kind: CalloutKind;
  /** '+' open by default, '-' folded by default, null not foldable */
  fold: "+" | "-" | null;
  title: string;
}

const HEADER_RE = /^\s{0,3}>\s?\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*(.*)$/;

/** Parse the first line of a blockquote (with its `>` marker) as a callout header. */
export function parseCalloutHeader(line: string): CalloutHeader | null {
  const m = HEADER_RE.exec(line);
  if (!m) return null;
  const type = m[1];
  const title = m[3].trim() || type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return { type: type.toLowerCase(), kind: calloutKind(type), fold: (m[2] as "+" | "-" | undefined) ?? null, title };
}

/** Same as parseCalloutHeader but for text with the `>` already stripped (rendered HTML paragraphs). */
export function parseCalloutText(text: string): CalloutHeader | null {
  return parseCalloutHeader("> " + text);
}
