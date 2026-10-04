/** Task checkbox helpers (Reading mode toggles the n-th task in the source). */

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s)/;

/** Toggle the n-th task item (outside fenced code). Returns null if not found. */
export function toggleNthTask(content: string, n: number): string | null {
  const lines = content.split("\n");
  let fence = false;
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = TASK_RE.exec(lines[i]);
    if (!m) continue;
    seen++;
    if (seen === n) {
      lines[i] = m[1] + (m[2] === " " ? "x" : " ") + lines[i].slice(m[1].length + 1);
      return lines.join("\n");
    }
  }
  return null;
}
