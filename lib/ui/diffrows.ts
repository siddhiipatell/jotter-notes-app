import { diffLines, type DiffLine } from "@/lib/core/merge";

export interface DiffCell { n: number; text: string; kind: "same" | "del" | "add" }
export interface DiffRow { left: DiffCell | null; right: DiffCell | null }

/**
 * Align a line diff into side-by-side rows. `mine` is left, `theirs` is right.
 * Adjacent del/add runs are paired line-by-line; the shorter side is padded with null.
 */
export function alignRows(mine: string, theirs: string, diff: DiffLine[] = diffLines(mine, theirs)): DiffRow[] {
  const rows: DiffRow[] = [];
  let l = 0;
  let r = 0;
  let i = 0;
  while (i < diff.length) {
    const d = diff[i];
    if (d.type === "same") {
      rows.push({ left: { n: ++l, text: d.text, kind: "same" }, right: { n: ++r, text: d.text, kind: "same" } });
      i++;
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < diff.length && diff[i].type !== "same") {
      (diff[i].type === "del" ? dels : adds).push(diff[i].text);
      i++;
    }
    const len = Math.max(dels.length, adds.length);
    for (let k = 0; k < len; k++) {
      rows.push({
        left: k < dels.length ? { n: ++l, text: dels[k], kind: "del" } : null,
        right: k < adds.length ? { n: ++r, text: adds[k], kind: "add" } : null,
      });
    }
  }
  return rows;
}

/** A starting point for "Edit merged result": shared lines once, differing hunks wrapped in markers. */
export function mergedDraft(mine: string, theirs: string): string {
  const diff = diffLines(mine, theirs);
  const out: string[] = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].type === "same") { out.push(diff[i].text); i++; continue; }
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < diff.length && diff[i].type !== "same") {
      (diff[i].type === "del" ? dels : adds).push(diff[i].text);
      i++;
    }
    out.push("<<<<<<< Mine", ...dels, "=======", ...adds, ">>>>>>> Theirs");
  }
  return out.join("\n");
}

export const hasConflictMarkers = (text: string) => /^(<<<<<<< Mine|=======|>>>>>>> Theirs)$/m.test(text);
