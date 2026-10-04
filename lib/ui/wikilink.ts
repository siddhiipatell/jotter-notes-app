/** Wikilink helpers for the UI (parsing `[[target#heading|alias]]`, path helpers). */

export const WIKILINK_RE = /(!?)\[\[([^\[\]\r\n|]+?)(?:\|([^\[\]\r\n]*?))?\]\]/g;

export interface WikiParts { target: string; heading?: string; block?: string; alias?: string }

export function parseWikiInner(inner: string): WikiParts {
  let alias: string | undefined;
  let rest = inner;
  const bar = rest.indexOf("|");
  if (bar >= 0) { alias = rest.slice(bar + 1).trim(); rest = rest.slice(0, bar); }
  let heading: string | undefined;
  let block: string | undefined;
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    const frag = rest.slice(hash + 1).trim();
    rest = rest.slice(0, hash);
    if (frag.startsWith("^")) block = frag.slice(1); else if (frag) heading = frag;
  }
  return { target: rest.trim(), heading, block, alias: alias || undefined };
}

export const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
export const isImagePath = (p: string) => IMAGE_EXT.test(p.split("#")[0]);
export const isNotePath = (p: string) => p.toLowerCase().endsWith(".md");

export const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const noteTitle = (p: string) => basename(p).replace(/\.md$/i, "");
export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Find a non-note file (attachment) for an embed target among known paths. */
export function findAttachment(target: string, fromPath: string, paths: readonly string[]): string | null {
  const t = target.replace(/^\/+/, "");
  if (paths.includes(t)) return t;
  const rel = joinPath(dirname(fromPath), t);
  if (paths.includes(rel)) return rel;
  const suffix = "/" + t;
  return paths.find((p) => p.endsWith(suffix)) ?? null;
}

/** Extract the section under `heading` (until the next heading of same or higher level), or a `^block` paragraph. */
export function extractSection(content: string, heading?: string, block?: string): string {
  if (block) {
    const paras = content.split(/\n{2,}/);
    const hit = paras.find((p) => new RegExp(`(^|\\s)\\^${block.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(p));
    return hit ? hit.replace(new RegExp(`\\s*\\^${block}\\s*$`), "") : "";
  }
  if (!heading) return content;
  const lines = content.split("\n");
  const norm = (s: string) => s.trim().toLowerCase();
  let start = -1;
  let level = 0;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0) {
      if (norm(m[2]) === norm(heading)) { start = i; level = m[1].length; }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start < 0 ? "" : lines.slice(start).join("\n");
}

/** Strip YAML frontmatter for rendering only (never used to rewrite notes). */
export function stripFrontmatter(content: string): string {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
  return m ? content.slice(m[0].length) : content;
}
