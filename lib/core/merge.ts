import { diffArrays } from "diff";

interface Hunk { start: number; end: number; lines: string[] } // replaces base[start,end)

const splitKeep = (s: string): string[] => (s === "" ? [] : s.split(/(?<=\n)/));

function hunks(base: string[], other: string[]): Hunk[] {
  const out: Hunk[] = [];
  let pos = 0;
  let cur: Hunk | null = null;
  for (const part of diffArrays(base, other)) {
    const n = part.value.length;
    if (!part.added && !part.removed) {
      if (cur) { out.push(cur); cur = null; }
      pos += n;
    } else {
      if (!cur) cur = { start: pos, end: pos, lines: [] };
      if (part.removed) { cur.end += n; pos += n; }
      else cur.lines.push(...part.value);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Text of base[start,end) after applying one side's hunks that fall inside the range. */
function render(base: string[], hs: Hunk[], start: number, end: number): string[] {
  const out: string[] = [];
  let pos = start;
  for (const h of hs) {
    out.push(...base.slice(pos, h.start), ...h.lines);
    pos = h.end;
  }
  out.push(...base.slice(pos, end));
  return out;
}

/**
 * Line-level three-way (diff3) merge. Identical changes on both sides merge cleanly.
 * On conflict returns `{ merged: mine, conflict: true }` so nothing is lost.
 */
export function threeWayMerge(base: string | null, mine: string, theirs: string): { merged: string; conflict: boolean } {
  if (mine === theirs) return { merged: mine, conflict: false };
  if (base !== null) {
    if (base === mine) return { merged: theirs, conflict: false };
    if (base === theirs) return { merged: mine, conflict: false };
  }
  const b = splitKeep(base ?? "");
  const A = hunks(b, splitKeep(mine));
  const B = hunks(b, splitKeep(theirs));
  const out: string[] = [];
  let pos = 0;
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    const a = A[i], bb = B[j];
    const first = !bb || (a && a.start <= bb.start) ? "A" : "B";
    let start = first === "A" ? a.start : bb.start;
    let end = first === "A" ? a.end : bb.end;
    const ai0 = i, bj0 = j;
    if (first === "A") i++; else j++;
    // grow cluster while the other side (or same side) touches it
    for (;;) {
      let grew = false;
      if (i < A.length && A[i].start <= end) { end = Math.max(end, A[i].end); i++; grew = true; }
      if (j < B.length && B[j].start <= end) { end = Math.max(end, B[j].end); j++; grew = true; }
      if (!grew) break;
    }
    out.push(...b.slice(pos, start));
    const ha = A.slice(ai0, i), hb = B.slice(bj0, j);
    if (!hb.length) out.push(...render(b, ha, start, end));
    else if (!ha.length) out.push(...render(b, hb, start, end));
    else {
      const ra = render(b, ha, start, end);
      const rb = render(b, hb, start, end);
      if (ra.length === rb.length && ra.every((l, k) => l === rb[k])) out.push(...ra);
      else return { merged: mine, conflict: true };
    }
    pos = end;
    start = end;
  }
  out.push(...b.slice(pos));
  return { merged: out.join(""), conflict: false };
}

export interface DiffLine { type: "add" | "del" | "same"; text: string }

/** Line diff for the conflict resolver UI (`del` = only in a, `add` = only in b). */
export function diffLines(a: string, b: string): DiffLine[] {
  const la = a === "" ? [] : a.split("\n");
  const lb = b === "" ? [] : b.split("\n");
  const out: DiffLine[] = [];
  for (const part of diffArrays(la, lb)) {
    const type = part.added ? "add" : part.removed ? "del" : "same";
    for (const text of part.value) out.push({ type, text });
  }
  return out;
}
