import { describe, expect, it } from "vitest";
import { parseNote, serializeProperties, setFrontmatterProperty, splitFrontmatter } from "../../lib/core/markdown";

describe("splitFrontmatter", () => {
  it("splits yaml and body and bodyOffset indexes the body", () => {
    const c = "---\ntitle: A\n---\nHello\n";
    const r = splitFrontmatter(c);
    expect(r.yaml).toBe("title: A");
    expect(r.body).toBe("Hello\n");
    expect(c.slice(r.bodyOffset)).toBe(r.body);
  });
  it("returns yaml null when there is no frontmatter or it is unterminated", () => {
    expect(splitFrontmatter("# hi").yaml).toBeNull();
    expect(splitFrontmatter("---\nfoo: 1\nno end").yaml).toBeNull();
    expect(splitFrontmatter("a\n---\nb: 1\n---\n").yaml).toBeNull();
  });
  it("handles empty frontmatter and CRLF", () => {
    expect(splitFrontmatter("---\n---\nx").yaml).toBe("");
    expect(splitFrontmatter("---\r\na: 1\r\n---\r\nx").yaml).toBe("a: 1");
  });
});

describe("parseNote", () => {
  it("parses title from filename, frontmatter and word count", () => {
    const p = parseNote("folder/My Note.md", "---\nstatus: draft\nn: 3\n---\nOne two three\n");
    expect(p.title).toBe("My Note");
    expect(p.frontmatter).toEqual({ status: "draft", n: 3 });
    expect(p.wordCount).toBe(3);
  });
  it("tolerates invalid YAML (empty frontmatter, still parses body)", () => {
    const p = parseNote("a.md", "---\nfoo: [unclosed\n  : :\n---\nBody #tag [[x]]");
    expect(p.frontmatter).toEqual({});
    expect(p.tags).toEqual(["tag"]);
    expect(p.links.map((l) => l.target)).toEqual(["x"]);
  });
  it("extracts wikilink target, heading, block, alias and embed with offsets and lines", () => {
    const c = "x [[Note#Head|Alias]]\n![[img.png]] [[Other#^abc]] [[#Local]]\n";
    const p = parseNote("a.md", c);
    expect(p.links).toHaveLength(4);
    const [a, b, d, e] = p.links;
    expect(a).toMatchObject({ target: "Note", heading: "Head", alias: "Alias", embed: false, line: 1, raw: "[[Note#Head|Alias]]" });
    expect(c.slice(a.start, a.end)).toBe(a.raw);
    expect(b).toMatchObject({ target: "img.png", embed: true, line: 2 });
    expect(d).toMatchObject({ target: "Other", block: "abc" });
    expect(e).toMatchObject({ target: "", heading: "Local" });
  });
  it("ignores links and tags inside fenced code and inline code", () => {
    const c = "```\n[[nope]] #nope\n```\n~~~js\n[[nope2]]\n~~~\n`[[nope3]] #nope3` real [[yes]] #yes\n";
    const p = parseNote("a.md", c);
    expect(p.links.map((l) => l.target)).toEqual(["yes"]);
    expect(p.tags).toEqual(["yes"]);
  });
  it("a longer fence is not closed by a shorter one", () => {
    const p = parseNote("a.md", "````\n```\n[[in]]\n```\n````\n[[out]]");
    expect(p.links.map((l) => l.target)).toEqual(["out"]);
  });
  it("tags: nested kept, not headings, not pure numbers, not in links/urls, frontmatter tags included, deduped", () => {
    const c = "---\ntags: [fm, \"#fm2\"]\ntag: single\n---\n# Heading\n#a/b text #2024 #v2 #a/b http://x.com/#frag [[Note#Sec]] [l](u#v) email#nope\n";
    const p = parseNote("a.md", c);
    expect(p.tags.sort()).toEqual(["a/b", "fm", "fm2", "single", "v2"].sort());
  });
  it("frontmatter tags can be a comma/space separated string or yaml list", () => {
    expect(parseNote("a.md", "---\ntags: one, two\n---\n").tags).toEqual(["one", "two"]);
    expect(parseNote("a.md", "---\ntags:\n  - x\n  - y/z\n---\n").tags).toEqual(["x", "y/z"]);
  });
  it("headings have level, text and 1-based line, and skip code", () => {
    const p = parseNote("a.md", "# One\ntext\n## Two ##\n```\n# not\n```\n###### Six\n####### seven\n");
    expect(p.headings).toEqual([
      { level: 1, text: "One", line: 1 },
      { level: 2, text: "Two", line: 3 },
      { level: 6, text: "Six", line: 7 },
    ]);
  });
  it("heading line numbers account for frontmatter lines", () => {
    const p = parseNote("a.md", "---\na: 1\n---\n# H\n");
    expect(p.headings[0].line).toBe(4);
  });
});

describe("setFrontmatterProperty (byte fidelity)", () => {
  const doc = "---\n# a comment\ntitle:   'Weird   spacing'\ntags:\n  - a\n  - b\nstatus: draft   # trailing\nlast: x\n---\n\nBody  with   odd spacing\t\n[[x]]\n";
  it("changes only the edited property and leaves every other byte identical", () => {
    const out = setFrontmatterProperty(doc, "status", "done");
    expect(out).toBe(doc.replace("draft", "done"));
  });
  it("replaces a block-list property without touching neighbours", () => {
    const out = setFrontmatterProperty(doc, "tags", ["a", "b", "c"]);
    expect(out).toBe(doc.replace("  - b\n", "  - b\n  - c\n"));
  });
  it("replacing with an identical value is a no-op for the file text", () => {
    expect(setFrontmatterProperty("---\nstatus: draft\n---\nx", "status", "draft")).toBe("---\nstatus: draft\n---\nx");
  });
  it("appends a new property at the end of the frontmatter", () => {
    expect(setFrontmatterProperty("---\na: 1\n---\nbody", "b", 2)).toBe("---\na: 1\nb: 2\n---\nbody");
  });
  it("adds into empty frontmatter and creates a block when none exists", () => {
    expect(setFrontmatterProperty("---\n---\nbody", "a", 1)).toBe("---\na: 1\n---\nbody");
    expect(setFrontmatterProperty("body\n", "a", [1, 2])).toBe("---\na:\n  - 1\n  - 2\n---\nbody\n");
  });
  it("deletes only the lines of that property", () => {
    expect(setFrontmatterProperty(doc, "last", undefined)).toBe(doc.replace("last: x\n", ""));
    expect(setFrontmatterProperty(doc, "tags", undefined)).toBe(doc.replace("tags:\n  - a\n  - b\n", ""));
    expect(setFrontmatterProperty("body", "a", undefined)).toBe("body");
  });
  it("preserves CRLF line endings for inserted text and untouched lines", () => {
    const c = "---\r\na: 1\r\n---\r\nbody\r\n";
    expect(setFrontmatterProperty(c, "b", "x")).toBe("---\r\na: 1\r\nb: x\r\n---\r\nbody\r\n");
    expect(setFrontmatterProperty(c, "a", 2)).toBe("---\r\na: 2\r\n---\r\nbody\r\n");
  });
  it("serializeProperties emits plain YAML with no fences", () => {
    expect(serializeProperties({ a: 1, t: ["x"] })).toBe("a: 1\nt:\n  - x");
    expect(serializeProperties({})).toBe("");
  });
  it("edit result parses to the new value", () => {
    const out = setFrontmatterProperty(doc, "status", "has: colon");
    expect(parseNote("a.md", out).frontmatter.status).toBe("has: colon");
  });
});
