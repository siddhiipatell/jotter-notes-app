/** Client-side content scan used when case-sensitive or regex search is toggled on. */

export interface ScanOptions { regex: boolean; caseSensitive: boolean }
export interface ScanHit { line: number; snippet: string }

export function compileQuery(query: string, opts: ScanOptions): RegExp | null {
  if (!query) return null;
  try {
    const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(src, opts.caseSensitive ? "" : "i");
  } catch {
    return null;
  }
}

export function scanContent(content: string, re: RegExp): ScanHit | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) {
      const start = Math.max(0, m.index - 40);
      const snippet = (start > 0 ? "…" : "") + lines[i].slice(start, m.index + m[0].length + 80).trim();
      return { line: i, snippet };
    }
  }
  return null;
}
