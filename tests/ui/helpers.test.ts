import { describe, expect, it } from "vitest";
import { parseCalloutHeader, calloutKind, parseCalloutText } from "@/lib/ui/callouts";
import { parseWikiInner, findAttachment, extractSection, stripFrontmatter, isImagePath, noteTitle, dirname, joinPath } from "@/lib/ui/wikilink";
import { toggleNthTask } from "@/lib/ui/tasks";
import { compileQuery, scanContent } from "@/lib/ui/textsearch";
import { alignRows, mergedDraft, hasConflictMarkers } from "@/lib/ui/diffrows";
import { sanitizeSettings, DEFAULT_SETTINGS } from "@/lib/ui/settings";

describe("callouts", () => {
  it("parses type, fold marker and title", () => {
    expect(parseCalloutHeader("> [!note]")).toEqual({ type: "note", kind: "note", fold: null, title: "Note" });
    expect(parseCalloutHeader("> [!warning]- Careful now")).toEqual({ type: "warning", kind: "warning", fold: "-", title: "Careful now" });
    expect(parseCalloutHeader(">[!TIP]+ Pro tip")?.fold).toBe("+");
  });
  it("rejects ordinary quotes", () => {
    expect(parseCalloutHeader("> just a quote")).toBeNull();
    expect(parseCalloutHeader("[!note]")).toBeNull();
  });
  it("maps aliases onto the five design types", () => {
    expect(calloutKind("info")).toBe("note");
    expect(calloutKind("hint")).toBe("tip");
    expect(calloutKind("check")).toBe("success");
    expect(calloutKind("caution")).toBe("warning");
    expect(calloutKind("bug")).toBe("danger");
    expect(calloutKind("unknown-type")).toBe("note");
  });
  it("parses rendered paragraph text", () => {
    expect(parseCalloutText("[!danger] Stop")?.title).toBe("Stop");
  });
});

describe("wikilink helpers", () => {
  it("splits target, heading, block and alias", () => {
    expect(parseWikiInner("Note")).toEqual({ target: "Note", heading: undefined, block: undefined, alias: undefined });
    expect(parseWikiInner("Note#Intro|see this")).toMatchObject({ target: "Note", heading: "Intro", alias: "see this" });
    expect(parseWikiInner("Note#^abc")).toMatchObject({ block: "abc" });
  });
  it("detects images and builds paths", () => {
    expect(isImagePath("a/b.PNG")).toBe(true);
    expect(isImagePath("a.md")).toBe(false);
    expect(noteTitle("x/y/Hello.md")).toBe("Hello");
    expect(dirname("x/y/Hello.md")).toBe("x/y");
    expect(joinPath("", "a.md")).toBe("a.md");
  });
  it("finds attachments by path, relative path or basename", () => {
    const paths = ["img/a.png", "notes/b.png", "n/c.md"];
    expect(findAttachment("img/a.png", "n/c.md", paths)).toBe("img/a.png");
    expect(findAttachment("b.png", "n/c.md", paths)).toBe("notes/b.png");
    expect(findAttachment("zzz.png", "n/c.md", paths)).toBeNull();
  });
  it("extracts a heading section up to the next same-level heading", () => {
    const md = "# A\none\n## B\ntwo\n### C\nthree\n## D\nfour";
    expect(extractSection(md, "B")).toBe("## B\ntwo\n### C\nthree");
    expect(extractSection(md, "Nope")).toBe("");
    expect(extractSection(md)).toBe(md);
  });
  it("extracts a block", () => {
    expect(extractSection("first\n\nsecond ^id1\n\nthird", undefined, "id1")).toBe("second");
  });
  it("strips frontmatter for rendering only", () => {
    expect(stripFrontmatter("---\na: 1\n---\nBody")).toBe("Body");
    expect(stripFrontmatter("No fm")).toBe("No fm");
  });
});

describe("tasks", () => {
  const md = "- [ ] a\n- [x] b\n```\n- [ ] in code\n```\n- [ ] c";
  it("toggles the nth task and skips code", () => {
    expect(toggleNthTask(md, 0)).toContain("- [x] a");
    expect(toggleNthTask(md, 1)).toContain("- [ ] b");
    expect(toggleNthTask(md, 2)).toContain("- [x] c");
    expect(toggleNthTask(md, 2)).toContain("- [ ] in code");
    expect(toggleNthTask(md, 9)).toBeNull();
  });
  it("does not reformat anything else", () => {
    expect(toggleNthTask("* [ ]   spaced\r\nnext", 0)).toBe("* [x]   spaced\r\nnext");
  });
});

describe("text search", () => {
  it("compiles literal, regex and case-sensitive queries", () => {
    expect(compileQuery("a.b", { regex: false, caseSensitive: false })?.test("a.b")).toBe(true);
    expect(compileQuery("a.b", { regex: false, caseSensitive: false })?.test("axb")).toBe(false);
    expect(compileQuery("a.b", { regex: true, caseSensitive: false })?.test("axb")).toBe(true);
    expect(compileQuery("Foo", { regex: false, caseSensitive: true })?.test("foo")).toBe(false);
    expect(compileQuery("(", { regex: true, caseSensitive: false })).toBeNull();
  });
  it("returns the first matching line", () => {
    const re = compileQuery("beta", { regex: false, caseSensitive: false })!;
    expect(scanContent("alpha\nthe BETA line\ngamma", re)).toMatchObject({ line: 1 });
    expect(scanContent("none", re)).toBeNull();
  });
});

describe("conflict diff rows", () => {
  it("aligns same, changed and added lines", () => {
    const rows = alignRows("a\nb\nc", "a\nB\nc\nd");
    expect(rows.map((r) => [r.left?.kind ?? "-", r.right?.kind ?? "-"])).toEqual([["same", "same"], ["del", "add"], ["same", "same"], ["-", "add"]]);
    expect(rows[1].left?.text).toBe("b");
    expect(rows[1].right?.text).toBe("B");
    expect(rows[3].right?.n).toBe(4);
  });
  it("builds a merge draft with markers and detects them", () => {
    const d = mergedDraft("a\nb", "a\nc");
    expect(d).toBe("a\n<<<<<<< Mine\nb\n=======\nc\n>>>>>>> Theirs");
    expect(hasConflictMarkers(d)).toBe(true);
    expect(hasConflictMarkers("plain")).toBe(false);
    expect(mergedDraft("same", "same")).toBe("same");
  });
});

describe("settings", () => {
  it("falls back to defaults for bad input", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ theme: "neon", fontSize: 999, noteFont: "x" })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ theme: "dark", fontSize: 18, readableWidth: false })).toMatchObject({ theme: "dark", fontSize: 18, readableWidth: false });
  });
});
