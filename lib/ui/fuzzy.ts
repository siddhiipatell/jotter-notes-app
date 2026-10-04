/** Pure helpers: fuzzy matching and operator chips (`tag:`, `path:`). No DOM, no React. */

export interface FuzzyResult { score: number; indices: number[] }

/**
 * Subsequence fuzzy match. Returns null when `query` is not a subsequence of `text`.
 * Higher score = better. Rewards consecutive runs, word starts and early matches.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) {
    const bonus = direct === 0 ? 40 : /[\s/_\-.]/.test(t[direct - 1] ?? "") ? 25 : 10;
    return { score: 100 + bonus - direct * 0.5 - (t.length - q.length) * 0.1, indices: Array.from({ length: q.length }, (_, i) => direct + i) };
  }
  const indices: number[] = [];
  let ti = 0;
  let score = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    indices.push(found);
    score += 1;
    if (found === prev + 1) score += 4;
    if (found === 0 || /[\s/_\-.]/.test(t[found - 1] ?? "")) score += 3;
    score -= (found - ti) * 0.05;
    prev = found;
    ti = found + 1;
  }
  return { score, indices };
}

export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string, limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit);
  const scored: { item: T; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const m = fuzzyMatch(query, text(item));
    if (m) scored.push({ item, score: m.score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.item);
}

export type OperatorName = "tag" | "path";
export interface OperatorChip { op: OperatorName; value: string }
export interface ParsedOperators { chips: OperatorChip[]; text: string }

const OP_RE = /(^|\s)(tag|path):(\S*)/gi;

/** Split a query into operator chips and the remaining free text. Includes an in-progress `tag:fo` token. */
export function parseOperators(input: string): ParsedOperators {
  const chips: OperatorChip[] = [];
  const text = input
    .replace(OP_RE, (_m, lead: string, op: string, value: string) => {
      const v = value.replace(/^#/, "");
      if (v) chips.push({ op: op.toLowerCase() as OperatorName, value: v });
      return lead;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { chips, text };
}

/**
 * Commit completed operator tokens (followed by whitespace) into chips so the UI can render
 * them as pills. A token still being typed (no trailing space) stays in `rest`.
 */
export function extractChips(input: string): { chips: OperatorChip[]; rest: string } {
  const chips: OperatorChip[] = [];
  const rest = input.replace(/(^|\s)(tag|path):(\S+)(?=\s)/gi, (_m, lead: string, op: string, value: string) => {
    chips.push({ op: op.toLowerCase() as OperatorName, value: value.replace(/^#/, "") });
    return lead;
  });
  return { chips, rest: chips.length ? rest.replace(/\s+/g, " ").replace(/^\s+/, "") : input };
}

export function chipsToString(chips: OperatorChip[]): string {
  return chips.map((c) => `${c.op}:${c.value}`).join(" ");
}

/** Apply path/tag chips to a candidate. `tags` are without '#'. */
export function matchesChips(chips: readonly OperatorChip[], path: string, tags: readonly string[]): boolean {
  for (const c of chips) {
    const v = c.value.toLowerCase();
    if (c.op === "path" && !path.toLowerCase().includes(v)) return false;
    if (c.op === "tag") {
      const ok = tags.some((t) => {
        const tl = t.toLowerCase();
        return tl === v || tl.startsWith(v + "/");
      });
      if (!ok) return false;
    }
  }
  return true;
}
