import type { Backlink, ParsedNote } from "../types";
import { basenameNoExt, lineStarts, maskCode, splitWikiInner } from "./markdown";

/* ------------------------------------------------------------------ */
/* Path helpers                                                        */
/* ------------------------------------------------------------------ */

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
export function filename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}
export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir ? fromDir.split("/") : [];
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}
const hasExt = (name: string) => /\.[A-Za-z0-9]{1,8}$/.test(name);

/* ------------------------------------------------------------------ */
/* Resolver                                                            */
/* ------------------------------------------------------------------ */

export type Resolver = (target: string, fromPath: string) => string | null;

/**
 * Build a fast resolver over a fixed set of paths. Obsidian rules: case-insensitive match,
 * optional `.md`, path-qualified targets match as path suffix, ties prefer the linking
 * note's folder then the shortest path. `aliases` maps lowercase alias -> note path.
 */
export function createResolver(allPaths: Iterable<string>, aliases?: Map<string, string>): Resolver {
  const byFull = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const p of allPaths) {
    byFull.set(p.toLowerCase(), p);
    const n = filename(p).toLowerCase();
    const arr = byName.get(n);
    if (arr) arr.push(p); else byName.set(n, [p]);
  }
  const pick = (cands: string[], fromDir: string): string | null => {
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    const score = (p: string) => (dirname(p) === fromDir ? 0 : 1000) + p.split("/").length;
    return [...cands].sort((x, y) => score(x) - score(y) || x.localeCompare(y))[0];
  };
  return (rawTarget, fromPath) => {
    let t = rawTarget.trim();
    const hash = t.indexOf("#");
    if (hash >= 0) t = t.slice(0, hash).trim();
    if (!t) return fromPath;
    const fromDir = dirname(fromPath);
    if (t.startsWith("./") || t.startsWith("../")) {
      const full = normalizePath((fromDir ? fromDir + "/" : "") + t).toLowerCase();
      return byFull.get(full + ".md") ?? byFull.get(full) ?? null;
    }
    t = t.replace(/^\/+/, "");
    const lt = t.toLowerCase();
    if (lt.includes("/")) {
      const exact = byFull.get(lt + ".md") ?? byFull.get(lt);
      if (exact) return exact;
      const base = filename(lt);
      for (const variant of [base + ".md", base]) {
        const cands = (byName.get(variant) ?? []).filter((p) => {
          const pl = p.toLowerCase();
          return pl.endsWith("/" + lt + ".md") || pl.endsWith("/" + lt);
        });
        const r = pick(cands, fromDir);
        if (r) return r;
      }
    } else {
      const r = pick(byName.get(lt + ".md") ?? [], fromDir) ?? pick(byName.get(lt) ?? [], fromDir);
      if (r) return r;
    }
    return aliases?.get(lt) ?? null;
  };
}

export function resolveLink(
  target: string,
  fromPath: string,
  allPaths: Iterable<string>,
  aliases?: Map<string, string>,
): string | null {
  return createResolver(allPaths, aliases)(target, fromPath);
}

/** Build an alias->path map from parsed notes' frontmatter `aliases`/`alias`. */
export function aliasMap(parsed: Iterable<ParsedNote>): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of parsed) {
    for (const key of ["aliases", "alias"]) {
      const v = n.frontmatter[key];
      const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
      for (const a of items) {
        if (typeof a !== "string" && typeof a !== "number") continue;
        const k = String(a).trim().toLowerCase();
        if (k && !m.has(k)) m.set(k, n.path);
      }
    }
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Backlinks                                                           */
/* ------------------------------------------------------------------ */

type ContentSource = Map<string, string> | ((p: string) => string);
const getContent = (src: ContentSource, p: string): string =>
  (typeof src === "function" ? src(p) : src.get(p)) ?? "";

function lineText(content: string, starts: number[], line: number): string {
  const s = starts[line - 1];
  const e = line < starts.length ? starts[line] : content.length;
  return content.slice(s, e).replace(/\r?\n$/, "").trim();
}

/** Map of target path -> notes linking to it. Self links are ignored. */
export function buildBacklinks(parsed: ParsedNote[], contents: ContentSource): Map<string, Backlink[]> {
  const resolve = createResolver(parsed.map((p) => p.path), aliasMap(parsed));
  const out = new Map<string, Backlink[]>();
  for (const n of parsed) {
    if (!n.links.length) continue;
    const content = getContent(contents, n.path);
    const starts = lineStarts(content);
    for (const l of n.links) {
      if (!l.target) continue;
      const dest = resolve(l.target, n.path);
      if (!dest || dest === n.path) continue;
      const bl: Backlink = { fromPath: n.path, fromTitle: n.title, line: l.line, context: lineText(content, starts, l.line) };
      const arr = out.get(dest);
      if (arr) arr.push(bl); else out.set(dest, [bl]);
    }
  }
  return out;
}

/**
 * Links whose target does not exist. Keyed by the link target text as written.
 * `extraPaths` are non-note files (attachments) that count as existing.
 */
export function unresolvedLinks(parsed: ParsedNote[], contents: ContentSource, extraPaths: Iterable<string> = []): Map<string, Backlink[]> {
  const resolve = createResolver([...parsed.map((p) => p.path), ...extraPaths], aliasMap(parsed));
  const out = new Map<string, Backlink[]>();
  for (const n of parsed) {
    if (!n.links.length) continue;
    let content: string | null = null;
    let starts: number[] = [];
    for (const l of n.links) {
      if (!l.target || resolve(l.target, n.path)) continue;
      if (content === null) { content = getContent(contents, n.path); starts = lineStarts(content); }
      const bl: Backlink = { fromPath: n.path, fromTitle: n.title, line: l.line, context: lineText(content, starts, l.line) };
      const arr = out.get(l.target);
      if (arr) arr.push(bl); else out.set(l.target, [bl]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rename edits                                                        */
/* ------------------------------------------------------------------ */

const SCHEME_RE = /^[a-z][a-z0-9+.\-]*:/i;

interface Edit { start: number; end: number; text: string }

function applyEdits(content: string, edits: Edit[]): string {
  if (!edits.length) return content;
  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const e of edits) {
    out += content.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  return out + content.slice(pos);
}

/**
 * Compute the content changes needed when `oldPath` is renamed/moved to `newPath`
 * (`oldPath` may also be a folder: every file under it moves). `files` maps every vault
 * path (before the rename) to its text. Returns only files whose content changes, keyed
 * by their path AFTER the rename (so the renamed note is keyed by its new path).
 * Only the link target text is rewritten; heading, alias, embed marker and every other
 * byte are preserved. Links that still resolve correctly are left untouched.
 */
export function computeRenameEdits(oldPath: string, newPath: string, files: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  if (oldPath === newPath) return result;
  const moved = (p: string): string =>
    p === oldPath ? newPath : p.startsWith(oldPath + "/") ? newPath + p.slice(oldPath.length) : p;
  const before = [...files.keys()];
  const after = before.map(moved);
  const resolveBefore = createResolver(before);
  const resolveAfter = createResolver(after);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const nameCount = new Map<string, number>();
  for (const p of after) {
    const k = (/\.md$/i.test(p) ? basenameNoExt(p) : filename(p)).toLowerCase();
    nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
  }
  const nameIn = (q: string) => (/\.md$/i.test(q) ? basenameNoExt(q) : filename(q));

  for (const [path, content] of files) {
    if (!content.includes("[")) continue;
    const newSelf = moved(path);
    const masked = maskCode(content);
    const edits: Edit[] = [];

    // ---- wikilinks / embeds
    const wre = /(!?)\[\[([^\[\]\r\n]*?)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = wre.exec(masked))) {
      const innerStart = m.index + m[1].length + 2;
      const inner = content.slice(innerStart, m.index + m[0].length - 2);
      const parts = splitWikiInner(inner);
      if (!parts.target) continue;
      const q = resolveBefore(parts.target, path);
      if (!q) continue;
      const q2 = moved(q);
      if (resolveAfter(parts.target, newSelf) === q2) continue; // still valid as written
      // locate the target text region in `inner`
      let end = inner.search(/#|\\?\|/);
      if (end < 0) end = inner.length;
      const region = inner.slice(0, end);
      const trimmed = region.trim();
      const hadMd = /\.md$/i.test(trimmed);
      const full = /\.md$/i.test(q2) && !hadMd ? q2.slice(0, -3) : q2;
      let next: string;
      if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
        const rel = relativePath(dirname(newSelf), q2);
        next = /\.md$/i.test(q2) && !hadMd ? rel.slice(0, -3) : rel;
        if (!rel.startsWith("../")) next = "./" + next;
      } else if (!trimmed.includes("/")) {
        const base = hadMd ? filename(q2) : nameIn(q2);
        next = resolveAfter(base, newSelf) === q2 && (nameCount.get(nameIn(q2).toLowerCase()) ?? 0) === 1 ? base : full;
      } else next = full;
      const rs = innerStart + region.indexOf(trimmed);
      edits.push({ start: rs, end: rs + trimmed.length, text: next });
    }

    // ---- standard markdown links / images
    const mre = /(!?\[[^\]\r\n]*\])\(([^()\r\n]*)\)/g;
    while ((m = mre.exec(masked))) {
      const destStart = m.index + m[1].length + 1;
      const raw = content.slice(destStart, destStart + m[2].length);
      const lead = raw.length - raw.trimStart().length;
      let body = raw.slice(lead);
      let angle = false;
      let urlText: string;
      if (body.startsWith("<")) {
        const close = body.indexOf(">");
        if (close < 0) continue;
        angle = true;
        urlText = body.slice(1, close);
        body = body.slice(0, close + 1);
      } else {
        const ws = body.search(/\s/);
        urlText = ws < 0 ? body : body.slice(0, ws);
        body = urlText;
      }
      const urlOffset = destStart + lead + (angle ? 1 : 0);
      if (!urlText || urlText.startsWith("#") || SCHEME_RE.test(urlText)) continue;
      const hashAt = urlText.indexOf("#");
      const pathPart = hashAt < 0 ? urlText : urlText.slice(0, hashAt);
      const frag = hashAt < 0 ? "" : urlText.slice(hashAt);
      let decoded = pathPart;
      try { decoded = decodeURIComponent(pathPart); } catch { /* keep */ }
      const abs = decoded.startsWith("/")
        ? normalizePath(decoded)
        : normalizePath((dirname(path) ? dirname(path) + "/" : "") + decoded);
      const exists = (set: Set<string>, p: string) => (set.has(p) ? p : set.has(p + ".md") ? p + ".md" : null);
      const q = exists(beforeSet, abs);
      if (!q) continue;
      const q2 = moved(q);
      const stillAbs = decoded.startsWith("/")
        ? abs
        : normalizePath((dirname(newSelf) ? dirname(newSelf) + "/" : "") + decoded);
      if (exists(afterSet, stillAbs) === q2) continue;
      const strip = !/\.md$/i.test(decoded) && /\.md$/i.test(q2);
      let rel = decoded.startsWith("/") ? "/" + q2 : relativePath(dirname(newSelf), q2);
      if (strip) rel = rel.slice(0, -3);
      if (/%[0-9A-Fa-f]{2}/.test(pathPart)) rel = encodeURI(rel);
      else if (!angle && /\s/.test(rel)) rel = rel.replace(/ /g, "%20");
      edits.push({ start: urlOffset, end: urlOffset + pathPart.length, text: rel });
    }

    const next = applyEdits(content, edits);
    if (next !== content) result.set(newSelf, next);
  }
  return result;
}
