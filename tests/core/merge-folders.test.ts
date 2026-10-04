import { describe, expect, it } from "vitest";
import { diffLines, threeWayMerge } from "../../lib/core/merge";
import { buildTree } from "../../lib/core/folders";

describe("threeWayMerge", () => {
  const base = "l1\nl2\nl3\nl4\nl5\n";
  it("takes theirs when only theirs changed and mine when only mine changed", () => {
    expect(threeWayMerge(base, base, "l1\nX\nl3\nl4\nl5\n")).toEqual({ merged: "l1\nX\nl3\nl4\nl5\n", conflict: false });
    expect(threeWayMerge(base, "l1\nl2\nl3\nl4\nY\n", base)).toEqual({ merged: "l1\nl2\nl3\nl4\nY\n", conflict: false });
  });
  it("merges non-overlapping edits from both sides", () => {
    const r = threeWayMerge(base, "MINE\nl2\nl3\nl4\nl5\n", "l1\nl2\nl3\nl4\nTHEIRS\n");
    expect(r).toEqual({ merged: "MINE\nl2\nl3\nl4\nTHEIRS\n", conflict: false });
  });
  it("merges insertions and deletions in different regions", () => {
    const r = threeWayMerge(base, "l1\nl2\nnew\nl3\nl4\nl5\n", "l1\nl2\nl3\nl5\n");
    expect(r).toEqual({ merged: "l1\nl2\nnew\nl3\nl5\n", conflict: false });
  });
  it("identical changes on both sides merge cleanly without duplication", () => {
    const edited = "l1\nSAME\nl3\nl4\nl5\n";
    expect(threeWayMerge(base, edited, edited)).toEqual({ merged: edited, conflict: false });
    const r = threeWayMerge(base, "l1\nSAME\nl3\nl4\nA\n", "l1\nSAME\nl3\nl4\nl5\nB\n");
    expect(r.conflict).toBe(true); // last line changed differently on both sides
  });
  it("same-region different edits conflict and return mine unchanged", () => {
    const mine = "l1\nMINE\nl3\nl4\nl5\n";
    const r = threeWayMerge(base, mine, "l1\nTHEIRS\nl3\nl4\nl5\n");
    expect(r).toEqual({ merged: mine, conflict: true });
  });
  it("edit vs delete of the same line conflicts", () => {
    expect(threeWayMerge(base, "l1\nchanged\nl3\nl4\nl5\n", "l1\nl3\nl4\nl5\n").conflict).toBe(true);
  });
  it("both sides appending different text at the end conflicts, same text does not", () => {
    expect(threeWayMerge("a\n", "a\nb\n", "a\nc\n").conflict).toBe(true);
    expect(threeWayMerge("a\n", "a\nb\n", "a\nb\n").conflict).toBe(false);
  });
  it("null base: identical content is clean, different content conflicts keeping mine", () => {
    expect(threeWayMerge(null, "x\n", "x\n")).toEqual({ merged: "x\n", conflict: false });
    expect(threeWayMerge(null, "x\n", "y\n")).toEqual({ merged: "x\n", conflict: true });
  });
  it("preserves CRLF and missing trailing newline of untouched regions", () => {
    const b = "a\r\nb\r\nc";
    const r = threeWayMerge(b, "A\r\nb\r\nc", "a\r\nb\r\nc");
    expect(r.merged).toBe("A\r\nb\r\nc");
    expect(threeWayMerge(b, "A\r\nb\r\nc", "a\r\nb\r\nC")).toEqual({ merged: "A\r\nb\r\nC", conflict: false });
  });
});

describe("diffLines", () => {
  it("labels added, deleted and unchanged lines in order", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
  it("handles empty inputs", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("", "x")).toEqual([{ type: "add", text: "x" }]);
  });
});

describe("buildTree", () => {
  const names = (n: { name: string }[]) => n.map((x) => x.name);
  it("puts folders first, then files, with natural sort", () => {
    const t = buildTree(["note 10.md", "note 2.md", "Zed/a.md", "alpha/b.md", "Beta.md"], new Set());
    expect(names(t)).toEqual(["alpha", "Zed", "Beta.md", "note 2.md", "note 10.md"]);
    expect(t[0]).toMatchObject({ type: "folder", path: "alpha", children: [{ name: "b.md", path: "alpha/b.md", type: "file" }] });
  });
  it("hides .jotter and other dot folders/files but shows attachments", () => {
    const t = buildTree([".jotter/config.json", ".git/x", "a/.hidden/n.md", "a/.DS_Store", "a/n.md", "img/pic.png", "readme.md"], new Set());
    expect(names(t)).toEqual(["a", "img", "readme.md"]);
    expect(names(t[0].children!)).toEqual(["n.md"]);
    expect(names(t[1].children!)).toEqual(["pic.png"]);
  });
  it("marks unsynced files and their ancestor folders", () => {
    const t = buildTree(["a/b/c.md", "a/d.md", "e.md"], new Set(["a/b/c.md"]));
    const a = t[0];
    expect(a.unsynced).toBe(true);
    expect(a.children![0].unsynced).toBe(true); // folder b
    expect(a.children![0].children![0].unsynced).toBe(true);
    expect(a.children![1].unsynced).toBeUndefined();
    expect(t[1].unsynced).toBeUndefined();
  });
  it("nests deep paths and handles an empty list", () => {
    expect(buildTree([], new Set())).toEqual([]);
    const t = buildTree(["x/y/z/n.md"], new Set());
    expect(t[0].children![0].children![0].children![0].path).toBe("x/y/z/n.md");
  });
});
