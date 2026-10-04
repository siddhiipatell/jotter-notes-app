import MiniSearch from "minisearch";
import type { ParsedNote, SearchHit } from "../types";
import { basenameNoExt, parseNote, splitFrontmatter } from "./markdown";

interface Doc {
  path: string;
  title: string;
  tags: string[]; // lowercase
  tagText: string;
  body: string; // note body (frontmatter excluded)
  bodyLower: string;
  pathLower: string;
}

export interface ParsedQuery {
  terms: string[];
  phrases: string[];
  tags: string[];
  paths: string[];
}

/** Parse `tag:x path:y "a phrase" other words` into its parts. */
export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], phrases: [], tags: [], paths: [] };
  const re = /(tag|path):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    if (m[1]) {
      const v = (m[2] ?? m[3] ?? "").trim().toLowerCase();
      if (!v) continue;
      if (m[1].toLowerCase() === "tag") out.tags.push(v.replace(/^#/, ""));
      else out.paths.push(v);
    } else if (m[4] !== undefined) {
      const p = m[4].trim().toLowerCase();
      if (p) out.phrases.push(p);
    } else if (m[5]) out.terms.push(m[5].replace(/^#/, "") || m[5]);
  }
  return out;
}

function makeSnippet(doc: Doc, needles: string[]): { snippet: string; line?: number } {
  const lines = doc.body.split("\n");
  const lowers = needles.map((n) => n.toLowerCase()).filter(Boolean);
  let first = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (first < 0) first = i;
    const ll = l.toLowerCase();
    if (lowers.some((n) => ll.includes(n))) return { snippet: clip(l, lowers), line: i + 1 };
  }
  return first >= 0 ? { snippet: clip(lines[first], []), line: first + 1 } : { snippet: "" };
}
function clip(line: string, needles: string[]): string {
  const t = line.trim();
  if (t.length <= 160) return t;
  const lower = t.toLowerCase();
  let at = 0;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i >= 0) { at = i; break; }
  }
  const start = Math.max(0, at - 60);
  return (start > 0 ? "…" : "") + t.slice(start, start + 160).trim() + (start + 160 < t.length ? "…" : "");
}

export class SearchIndex {
  private ms: MiniSearch<Doc>;
  private docs = new Map<string, Doc>();

  constructor() {
    this.ms = new MiniSearch<Doc>({
      idField: "path",
      fields: ["title", "pathLower", "tagText", "body"],
      storeFields: [],
      searchOptions: {
        boost: { title: 4, pathLower: 1.5, tagText: 2 },
        prefix: true,
        fuzzy: (term) => (term.length > 4 ? 0.2 : false),
        combineWith: "AND",
      },
    });
  }

  get size(): number {
    return this.docs.size;
  }

  /** Add or replace a note. Pass `parsed` if already available to avoid re-parsing. */
  upsert(path: string, content: string, parsed?: ParsedNote): void {
    const p = parsed ?? parseNote(path, content);
    const body = splitFrontmatter(content).body;
    const tags = p.tags.map((t) => t.toLowerCase());
    const doc: Doc = {
      path,
      title: basenameNoExt(path),
      tags,
      tagText: tags.join(" ").replace(/\//g, " "),
      body,
      bodyLower: body.toLowerCase(),
      pathLower: path.toLowerCase(),
    };
    if (this.docs.has(path)) this.ms.replace(doc); else this.ms.add(doc);
    this.docs.set(path, doc);
  }

  remove(path: string): void {
    if (!this.docs.has(path)) return;
    this.ms.discard(path);
    this.docs.delete(path);
  }

  rename(oldPath: string, newPath: string): void {
    const d = this.docs.get(oldPath);
    if (!d) return;
    this.remove(oldPath);
    this.upsert(newPath, d.body, { path: newPath, title: basenameNoExt(newPath), frontmatter: {}, links: [], tags: d.tags, headings: [], wordCount: 0 });
  }

  clear(): void {
    this.ms.removeAll();
    this.docs.clear();
  }

  search(query: string, limit = 50): SearchHit[] {
    const q = parseQuery(query);
    const hasText = q.terms.length > 0 || q.phrases.length > 0;
    if (!hasText && !q.tags.length && !q.paths.length) return [];

    const matchesFilters = (d: Doc): boolean => {
      for (const t of q.tags) if (!d.tags.some((x) => x === t || x.startsWith(t + "/"))) return false;
      for (const p of q.paths) if (!d.pathLower.includes(p)) return false;
      for (const ph of q.phrases) if (!d.bodyLower.includes(ph) && !d.title.toLowerCase().includes(ph)) return false;
      return true;
    };

    const needles = [...q.terms, ...q.phrases];
    const hits: SearchHit[] = [];
    if (hasText) {
      const text = [...q.terms, ...q.phrases].join(" ");
      const filter = (r: { id: string }) => {
        const d = this.docs.get(r.id);
        return !!d && matchesFilters(d);
      };
      let res = this.ms.search(text, { filter });
      if (!res.length && q.terms.length > 1 && !q.phrases.length) res = this.ms.search(text, { filter, combineWith: "OR" });
      for (const r of res.slice(0, limit)) {
        const d = this.docs.get(r.id)!;
        const { snippet, line } = makeSnippet(d, needles);
        hits.push({ path: d.path, title: d.title, score: r.score, snippet, line });
      }
    } else {
      const all = [...this.docs.values()].filter(matchesFilters).sort((a, b) => a.pathLower.localeCompare(b.pathLower));
      for (const d of all.slice(0, limit)) {
        const { snippet, line } = makeSnippet(d, []);
        hits.push({ path: d.path, title: d.title, score: 1, snippet, line });
      }
    }
    return hits;
  }

  /** Fuzzy filename/path jump list (subsequence scoring). Recency-agnostic. */
  quickSwitch(query: string, limit = 20): { path: string; title: string }[] {
    const q = query.trim().toLowerCase().replace(/\.md$/, "");
    const items: { path: string; title: string; score: number }[] = [];
    for (const d of this.docs.values()) {
      const s = q ? fuzzyScore(q, d.pathLower, d.title.toLowerCase()) : 0;
      if (s === null) continue;
      items.push({ path: d.path, title: d.title, score: s });
    }
    items.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return items.slice(0, limit).map(({ path, title }) => ({ path, title }));
  }

  /** Exact tags (nested tags are separate entries, e.g. `a` and `a/b`), most used first. Tags are lowercased. */
  allTags(): { tag: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const d of this.docs.values()) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
}

function subseq(q: string, text: string, from = 0): number | null {
  let score = 0;
  let ti = from;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = text.indexOf(q[qi], ti);
    if (idx < 0) return null;
    score += 1;
    if (idx === prev + 1) score += 3; // consecutive
    const before = idx === 0 ? "/" : text[idx - 1];
    if (before === "/" || before === " " || before === "-" || before === "_" || before === ".") score += 4; // word start
    prev = idx;
    ti = idx + 1;
  }
  return score;
}

function fuzzyScore(q: string, pathLower: string, titleLower: string): number | null {
  const t = subseq(q, titleLower);
  let best: number | null = null;
  if (t !== null) {
    best = t * 3 + (titleLower === q ? 100 : titleLower.startsWith(q) ? 40 : titleLower.includes(q) ? 20 : 0) - titleLower.length * 0.05;
  }
  const p = subseq(q, pathLower);
  if (p !== null) {
    const s = p + (pathLower.includes(q) ? 5 : 0) - pathLower.length * 0.02;
    if (best === null || s > best) best = s;
  }
  return best;
}
