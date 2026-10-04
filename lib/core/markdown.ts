import YAML from "yaml";
import type { Heading, ParsedNote, WikiLink } from "../types";

/* ------------------------------------------------------------------ */
/* Frontmatter location / split                                        */
/* ------------------------------------------------------------------ */

interface FmLoc { yamlStart: number; yamlEnd: number; bodyOffset: number }

function locateFrontmatter(content: string): FmLoc | null {
  const open = /^﻿?---[ \t]*\r?\n/.exec(content);
  if (!open) return null;
  const yamlStart = open[0].length;
  const closeRe = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closeRe.lastIndex = yamlStart;
  const m = closeRe.exec(content);
  if (!m) return null;
  let yamlEnd = m.index;
  if (yamlEnd > yamlStart) {
    yamlEnd -= content[yamlEnd - 2] === "\r" ? 2 : 1;
  }
  return { yamlStart, yamlEnd, bodyOffset: m.index + m[0].length };
}

/** Split a note into its YAML frontmatter text (no fences) and body. `body === content.slice(bodyOffset)`. */
export function splitFrontmatter(content: string): { yaml: string | null; body: string; bodyOffset: number } {
  const loc = locateFrontmatter(content);
  if (!loc) return { yaml: null, body: content, bodyOffset: 0 };
  return { yaml: content.slice(loc.yamlStart, loc.yamlEnd), body: content.slice(loc.bodyOffset), bodyOffset: loc.bodyOffset };
}

function parseYamlObject(yamlText: string | null): Record<string, unknown> {
  if (!yamlText || !yamlText.trim()) return {};
  try {
    const d = YAML.parseDocument(yamlText, { strict: false, logLevel: "silent" });
    if (d.errors.length) return {};
    const v = d.toJS();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Code masking (same length, so offsets stay valid)                   */
/* ------------------------------------------------------------------ */

function blank(s: string): string {
  return s.replace(/[^\r\n]/g, " ");
}

/**
 * Replace the contents of fenced code blocks and inline code with spaces, preserving
 * length and newlines. Frontmatter is left untouched.
 */
export function maskCode(content: string): string {
  const loc = locateFrontmatter(content);
  const start = loc ? loc.bodyOffset : 0;
  const head = content.slice(0, start);
  const body = content.slice(start);
  const lines = body.split(/(?<=\n)/); // keep terminators
  const out: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  const inlineRe = /(?<!`)(`+)(?!`)[^]*?(?<!`)\1(?!`)/g;
  // join non-fence text in paragraph chunks so inline code spanning lines is handled
  let pending = "";
  const flush = () => {
    if (pending) out.push(pending.replace(inlineRe, (m) => blank(m)));
    pending = "";
  };
  for (const line of lines) {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.ch === "`" ? "`" : "~"}{${fence.len},}[ \\t]*\\r?\\n?$`);
      if (close.test(line)) fence = null;
      out.push(blank(line));
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r?\n$/, ""));
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      flush();
      fence = { ch: open[1][0], len: open[1].length };
      out.push(blank(line));
      continue;
    }
    if (/^\s*$/.test(line)) {
      flush();
      out.push(line);
    } else {
      pending += line;
    }
  }
  flush();
  return head + out.join("");
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
export function lineOf(starts: number[], offset: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1; // 1-based
}

export const WIKILINK_RE = /(!?)\[\[([^\[\]\r\n]*?)\]\]/g;

/** Split the inside of a wikilink (`target#heading|alias`) into parts. */
export function splitWikiInner(inner: string): { target: string; heading?: string; block?: string; alias?: string } {
  let main = inner;
  let alias: string | undefined;
  const pipe = /\\?\|/.exec(inner);
  if (pipe) {
    main = inner.slice(0, pipe.index);
    alias = inner.slice(pipe.index + pipe[0].length);
  }
  let target = main;
  let heading: string | undefined;
  let block: string | undefined;
  const hash = main.indexOf("#");
  if (hash >= 0) {
    target = main.slice(0, hash);
    const rest = main.slice(hash + 1);
    if (rest.startsWith("^")) block = rest.slice(1);
    else if (rest.includes("#^")) {
      const i = rest.indexOf("#^");
      heading = rest.slice(0, i);
      block = rest.slice(i + 2);
    } else heading = rest;
  }
  return { target: target.trim(), heading: heading?.trim(), block: block?.trim(), alias: alias?.trim() };
}

export function extractLinks(content: string, masked: string = maskCode(content)): WikiLink[] {
  const starts = lineStarts(content);
  const links: WikiLink[] = [];
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, "g");
  while ((m = re.exec(masked))) {
    const parts = splitWikiInner(content.slice(m.index + m[1].length + 2, m.index + m[0].length - 2));
    if (!parts.target && !parts.heading && !parts.block) continue;
    const link: WikiLink = {
      raw: content.slice(m.index, m.index + m[0].length),
      target: parts.target,
      embed: m[1] === "!",
      start: m.index,
      end: m.index + m[0].length,
      line: lineOf(starts, m.index),
    };
    if (parts.heading !== undefined) link.heading = parts.heading;
    if (parts.block !== undefined) link.block = parts.block;
    if (parts.alias !== undefined) link.alias = parts.alias;
    links.push(link);
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* Tags, headings                                                      */
/* ------------------------------------------------------------------ */

const TAG_RE = /(?<![\p{L}\p{N}_\/&#\\])#([\p{L}\p{N}_\-\/]+)/gu;

function normalizeTag(t: string): string | null {
  const tag = t.replace(/^#+/, "").replace(/\/+$/, "").trim();
  if (!tag || /^\d+$/.test(tag) || /\s/.test(tag)) return null;
  return tag;
}

function extractInlineTags(maskedBody: string): string[] {
  // hide link/URL syntax so `[[a#b]]`, `](x#y)` and `http://x/#frag` are not tags
  const text = maskedBody
    .replace(/!?\[\[[^\]\r\n]*\]\]/g, (m) => blank(m))
    .replace(/\]\([^)\r\n]*\)/g, (m) => blank(m))
    .replace(/\bhttps?:\/\/\S+/g, (m) => blank(m))
    .replace(/%%[^]*?%%/g, (m) => blank(m));
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(TAG_RE.source, "gu");
  while ((m = re.exec(text))) {
    const t = normalizeTag(m[1]);
    if (t) tags.push(t);
  }
  return tags;
}

function frontmatterTags(fm: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["tags", "tag"]) {
    const v = fm[key];
    const items: unknown[] = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : [];
    for (const it of items) {
      if (typeof it !== "string" && typeof it !== "number") continue;
      const t = normalizeTag(String(it));
      if (t) out.push(t);
    }
  }
  return out;
}

function extractHeadings(masked: string, starts: number[]): Heading[] {
  const out: Heading[] = [];
  const re = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const text = m[2].replace(/\r$/, "").trim();
    if (!text) continue;
    out.push({ level: m[1].length, text, line: lineOf(starts, m.index) });
  }
  return out;
}

function countWords(maskedBody: string): number {
  let n = 0;
  for (const tok of maskedBody.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(tok)) n++;
  return n;
}

export function basenameNoExt(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.md$/i, "");
}

/** Parse a note. Line numbers are 1-based; offsets (`start`/`end`) index into `content`. Never throws. */
export function parseNote(path: string, content: string): ParsedNote {
  const loc = locateFrontmatter(content);
  const fm = loc ? parseYamlObject(content.slice(loc.yamlStart, loc.yamlEnd)) : {};
  const masked = maskCode(content);
  const starts = lineStarts(content);
  const bodyStart = loc ? loc.bodyOffset : 0;
  const maskedBody = masked.slice(bodyStart);
  const tagSet = new Set<string>([...frontmatterTags(fm), ...extractInlineTags(maskedBody)]);
  const headings = extractHeadings(blank(masked.slice(0, bodyStart)) + maskedBody, starts);
  return {
    path,
    title: basenameNoExt(path),
    frontmatter: fm,
    links: extractLinks(content, masked),
    tags: [...tagSet],
    headings,
    wordCount: countWords(maskedBody),
  };
}

/* ------------------------------------------------------------------ */
/* Frontmatter editing with byte-fidelity                              */
/* ------------------------------------------------------------------ */

/** Serialise a property map as YAML text (no `---` fences, no trailing newline). */
export function serializeProperties(props: Record<string, unknown>): string {
  if (Object.keys(props).length === 0) return "";
  return YAML.stringify(props, { lineWidth: 0 }).replace(/\n+$/, "");
}

/**
 * Set (or, when `value === undefined`, delete) one top-level frontmatter property.
 * Only the lines of that property change; every other byte of the file is preserved.
 * Creates a frontmatter block if there is none.
 */
export function setFrontmatterProperty(content: string, key: string, value: unknown): string {
  const nl = content.includes("\r\n") ? "\r\n" : "\n";
  const loc = locateFrontmatter(content);
  const newText = value === undefined ? "" : serializeProperties({ [key]: value }).replace(/\n/g, nl);

  if (!loc) {
    if (value === undefined) return content;
    return `---${nl}${newText}${nl}---${nl}${content}`;
  }
  const yamlText = content.slice(loc.yamlStart, loc.yamlEnd);
  let doc: YAML.Document.Parsed | null = null;
  try {
    doc = YAML.parseDocument(yamlText, { strict: false, logLevel: "silent" });
    if (doc.errors.length || !YAML.isMap(doc.contents)) doc = null;
  } catch {
    doc = null;
  }
  if (doc && YAML.isMap(doc.contents)) {
    for (const pair of doc.contents.items) {
      const k = YAML.isScalar(pair.key) ? pair.key.value : pair.key;
      if (String(k) !== key) continue;
      const keyNode = pair.key as YAML.Scalar;
      const valNode = pair.value as YAML.Node | null;
      const from = keyNode.range![0];
      let to = valNode?.range ? valNode.range[1] : keyNode.range![1];
      // block scalars/sequences may include trailing newline in range; trim it back
      while (to > from && /[\r\n]/.test(yamlText[to - 1])) to--;
      if (value === undefined) {
        // remove whole lines (also a same-line trailing comment)
        let ls = yamlText.lastIndexOf("\n", from - 1) + 1;
        let le = yamlText.indexOf("\n", to);
        le = le === -1 ? yamlText.length : le + 1;
        if (le === yamlText.length && ls > 0) ls -= yamlText[ls - 2] === "\r" ? 2 : 1; // last line: drop preceding newline
        const nextYaml = yamlText.slice(0, ls) + yamlText.slice(le);
        return content.slice(0, loc.yamlStart) + nextYaml + content.slice(loc.yamlEnd);
      }
      const nextYaml = yamlText.slice(0, from) + newText + yamlText.slice(to);
      return content.slice(0, loc.yamlStart) + nextYaml + content.slice(loc.yamlEnd);
    }
  }
  if (value === undefined) return content;
  // append a new property at the end of the frontmatter
  if (yamlText.length === 0 && loc.yamlEnd === loc.yamlStart) {
    return content.slice(0, loc.yamlStart) + newText + nl + content.slice(loc.yamlEnd);
  }
  return content.slice(0, loc.yamlEnd) + nl + newText + content.slice(loc.yamlEnd);
}
