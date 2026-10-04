import { describe, expect, it } from "vitest";
import { aliasMap, buildBacklinks, computeRenameEdits, resolveLink, unresolvedLinks } from "../../lib/core/links";
import { parseNote } from "../../lib/core/markdown";

describe("resolveLink", () => {
  const paths = ["Home.md", "a/Note.md", "b/deep/Note.md", "b/Other.md", "img/pic.png", "Projects/Plan.md", "Archive/Projects/Plan.md"];
  it("matches basename case-insensitively with optional .md", () => {
    expect(resolveLink("home", "x.md", paths)).toBe("Home.md");
    expect(resolveLink("HOME.md", "x.md", paths)).toBe("Home.md");
    expect(resolveLink("other", "x.md", paths)).toBe("b/Other.md");
  });
  it("disambiguates by same folder first, then shortest path", () => {
    expect(resolveLink("Note", "b/deep/x.md", paths)).toBe("b/deep/Note.md");
    expect(resolveLink("Note", "a/x.md", paths)).toBe("a/Note.md");
    expect(resolveLink("Note", "root.md", paths)).toBe("a/Note.md");
  });
  it("resolves path-qualified targets as vault-root path or suffix", () => {
    expect(resolveLink("Projects/Plan", "x.md", paths)).toBe("Projects/Plan.md");
    expect(resolveLink("deep/Note", "x.md", paths)).toBe("b/deep/Note.md");
    expect(resolveLink("Archive/Projects/Plan.md", "x.md", paths)).toBe("Archive/Projects/Plan.md");
  });
  it("resolves ./ and ../ relative targets", () => {
    expect(resolveLink("../Other", "b/deep/x.md", paths)).toBe("b/Other.md");
    expect(resolveLink("./Note", "a/x.md", paths)).toBe("a/Note.md");
  });
  it("resolves attachments by full filename and returns null for missing", () => {
    expect(resolveLink("pic.png", "x.md", paths)).toBe("img/pic.png");
    expect(resolveLink("nothing", "x.md", paths)).toBeNull();
  });
  it("ignores #heading suffix and resolves empty target to the current note", () => {
    expect(resolveLink("Home#Intro", "x.md", paths)).toBe("Home.md");
    expect(resolveLink("", "x.md", paths)).toBe("x.md");
  });
  it("falls back to frontmatter aliases when provided", () => {
    const notes = [parseNote("Home.md", "---\naliases: [Start Page, hq]\n---\n")];
    const al = aliasMap(notes);
    expect(resolveLink("start page", "x.md", paths, al)).toBe("Home.md");
    expect(resolveLink("hq", "x.md", paths)).toBeNull();
  });
});

describe("computeRenameEdits", () => {
  it("rewrites only the target text and preserves heading, alias, embed marker and all other bytes", () => {
    const files = new Map([
      ["old.md", "# old\n"],
      ["a.md", "keep  \t\n[[old]] [[Old#Head|alias]] ![[old.md]] [[old#^blk]] [[other]]\r\ntrailing  "],
      ["b.md", "nothing here"],
    ]);
    const out = computeRenameEdits("old.md", "new name.md", files);
    expect([...out.keys()]).toEqual(["a.md"]);
    expect(out.get("a.md")).toBe("keep  \t\n[[new name]] [[new name#Head|alias]] ![[new name.md]] [[new name#^blk]] [[other]]\r\ntrailing  ");
  });
  it("returns only files whose content changes", () => {
    const files = new Map([["x.md", "[[a]]"], ["y.md", "[[b]]"], ["a.md", ""], ["b.md", ""]]);
    const out = computeRenameEdits("a.md", "c.md", files);
    expect([...out.keys()]).toEqual(["x.md"]);
  });
  it("leaves links inside code untouched", () => {
    const files = new Map([["a.md", ""], ["x.md", "`[[a]]`\n```\n[[a]]\n```\n[[a]]"]]);
    expect(computeRenameEdits("a.md", "b.md", files).get("x.md")).toBe("`[[a]]`\n```\n[[a]]\n```\n[[b]]");
  });
  it("keeps path-qualified style and uses the full path when moving between folders", () => {
    const files = new Map([["f/a.md", ""], ["x.md", "[[f/a]] [[a]]"]]);
    const out = computeRenameEdits("f/a.md", "g/a.md", files);
    // basename link still resolves, so only the qualified one changes
    expect(out.get("x.md")).toBe("[[g/a]] [[a]]");
  });
  it("uses a path when the new basename would be ambiguous", () => {
    const files = new Map([["a.md", ""], ["b.md", ""], ["x.md", "[[a]]"]]);
    const out = computeRenameEdits("a.md", "q/b.md", files);
    expect(out.get("x.md")).toBe("[[q/b]]");
  });
  it("rewrites standard markdown links and images relative to the linking note, keeping encoding", () => {
    const files = new Map([
      ["docs/a.md", ""],
      ["docs/x.md", "[t](a.md) ![i](a.md#sec) [u](https://e.com/a.md) [e](<a.md> \"Title\")"],
      ["y.md", "[t](docs/a.md) [s](docs/a%20b.md)"],
    ]);
    const out = computeRenameEdits("docs/a.md", "docs/sub/new note.md", files);
    expect(out.get("docs/x.md")).toBe("[t](sub/new%20note.md) ![i](sub/new%20note.md#sec) [u](https://e.com/a.md) [e](<sub/new note.md> \"Title\")");
    expect(out.get("y.md")).toBe("[t](docs/sub/new%20note.md) [s](docs/a%20b.md)");
  });
  it("updates relative links inside the renamed note itself and keys it by its new path", () => {
    const files = new Map([
      ["a/note.md", "[x](../b/other.md) [[../b/other]] [[other]] [self](note.md)"],
      ["b/other.md", ""],
    ]);
    const out = computeRenameEdits("a/note.md", "c/d/note.md", files);
    expect([...out.keys()]).toEqual(["c/d/note.md"]);
    expect(out.get("c/d/note.md")).toBe("[x](../../b/other.md) [[../../b/other]] [[other]] [self](note.md)");
  });
  it("handles a note linking to itself by name", () => {
    const files = new Map([["a.md", "[[a#h]]"]]);
    expect(computeRenameEdits("a.md", "b.md", files).get("b.md")).toBe("[[b#h]]");
  });
  it("renames attachments keeping the extension", () => {
    const files = new Map([["x.md", "![[pic.png]] ![p](img/pic.png)"], ["img/pic.png", ""]]);
    const out = computeRenameEdits("img/pic.png", "img/photo.png", files);
    expect(out.get("x.md")).toBe("![[photo.png]] ![p](img/photo.png)");
  });
  it("handles folder renames by moving every file under it", () => {
    const files = new Map([["dir/a.md", ""], ["x.md", "[[dir/a]] [m](dir/a.md) [[a]]"]]);
    const out = computeRenameEdits("dir", "folder", files);
    expect(out.get("x.md")).toBe("[[folder/a]] [m](folder/a.md) [[a]]");
  });
  it("is a no-op when old === new", () => {
    expect(computeRenameEdits("a.md", "a.md", new Map([["a.md", "[[a]]"]])).size).toBe(0);
  });
});

describe("backlinks", () => {
  const files = new Map([
    ["A.md", "intro\nsee [[B]] and [[b#h|alias]]\n"],
    ["B.md", "[[A]]\n[[B]] self\n[[Missing]]"],
    ["C.md", "---\naliases: [Cee]\n---\n[[B]]"],
    ["D.md", "[[cee]] [[Ghost]]"],
  ]);
  const parsed = [...files].map(([p, c]) => parseNote(p, c));
  it("maps targets to the notes (and lines) that link to them, ignoring self links", () => {
    const bl = buildBacklinks(parsed, files);
    expect(bl.get("B.md")!.map((b) => [b.fromPath, b.line, b.context])).toEqual([
      ["A.md", 2, "see [[B]] and [[b#h|alias]]"],
      ["A.md", 2, "see [[B]] and [[b#h|alias]]"],
      ["C.md", 4, "[[B]]"],
    ]);
    expect(bl.get("A.md")!.map((b) => b.fromTitle)).toEqual(["B"]);
  });
  it("resolves backlinks through frontmatter aliases and accepts a content function", () => {
    const bl = buildBacklinks(parsed, (p) => files.get(p)!);
    expect(bl.get("C.md")!.map((b) => b.fromPath)).toEqual(["D.md"]);
  });
  it("unresolvedLinks lists missing targets with where they appear", () => {
    const u = unresolvedLinks(parsed, files);
    expect([...u.keys()].sort()).toEqual(["Ghost", "Missing"]);
    expect(u.get("Ghost")![0].fromPath).toBe("D.md");
  });
});
