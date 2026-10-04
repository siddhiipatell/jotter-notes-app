import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import type { Decoration, DecorationSet } from "@codemirror/view";
import { buildInline, calloutToggles, frontmatterEnd, touches } from "@/lib/ui/livepreview";

const ctx = {
  resolveLink: (t: string) => (t === "Known" ? "Known.md" : null),
  findAttachment: () => null,
};

function make(doc: string, cursor = 0): EditorState {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(cursor), extensions: [markdown({ base: markdownLanguage }), calloutToggles] });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}
interface Item { from: number; to: number; cls: string; hide: boolean; widget: boolean; attrs?: Record<string, string> }
function items(deco: DecorationSet, len: number): Item[] {
  const out: Item[] = [];
  deco.between(0, len, (from, to, v: Decoration) => {
    const spec = v.spec as { class?: string; widget?: unknown; attributes?: Record<string, string> };
    out.push({ from, to, cls: spec.class ?? "", hide: !spec.class && !spec.widget && from < to, widget: !!spec.widget, attrs: spec.attributes });
  });
  return out;
}
const run = (doc: string, cursor = doc.length) => {
  const s = make(doc, cursor);
  return items(buildInline(s, [{ from: 0, to: doc.length }], ctx), doc.length);
};
const has = (list: Item[], cls: string) => list.some((i) => i.cls.split(" ").includes(cls));

describe("live preview decorations", () => {
  it("styles headings and hides the marker away from the cursor", () => {
    const doc = "# Title\n\nbody";
    const far = run(doc, doc.length);
    expect(has(far, "cm-h1")).toBe(true);
    expect(far.some((i) => i.hide && i.from === 0 && i.to === 2)).toBe(true);
    const near = run(doc, 3);
    expect(near.some((i) => i.hide && i.from === 0)).toBe(false);
    expect(near.some((i) => i.cls === "cm-syntax" && i.from === 0)).toBe(true);
  });

  it("hides bold marks until the cursor is inside, then dims them", () => {
    const doc = "a **bold** b\n\nz";
    const far = run(doc, doc.length);
    expect(has(far, "cm-strong")).toBe(true);
    expect(far.filter((i) => i.hide).length).toBe(2);
    const inside = run(doc, 5);
    expect(inside.filter((i) => i.hide).length).toBe(0);
    expect(inside.filter((i) => i.cls === "cm-syntax").length).toBe(2);
  });

  it("marks resolved and unresolved wikilinks with their targets", () => {
    const doc = "see [[Known]] and [[Missing|alias]]\n\nend";
    const list = run(doc, doc.length);
    const links = list.filter((i) => i.cls.includes("cm-wikilink"));
    expect(links).toHaveLength(2);
    expect(links[0].cls).not.toContain("unresolved");
    expect(links[1].cls).toContain("cm-wikilink-unresolved");
    expect(links[1].attrs?.["data-target"]).toBe("Missing");
    // alias display: only "alias" is visible
    expect(doc.slice(links[1].from, links[1].to)).toBe("alias");
  });

  it("reveals a wikilink's brackets when the cursor is on it", () => {
    const doc = "[[Known]]\n\nend";
    const near = run(doc, 3);
    expect(near.some((i) => i.hide)).toBe(false);
    expect(near.filter((i) => i.cls === "cm-syntax")).toHaveLength(2);
  });

  it("renders #tags as pills but not headings or code", () => {
    const list = run("text #todo and `#code`\n\n# Heading\n\nend");
    const tags = list.filter((i) => i.cls === "cm-tag");
    expect(tags).toHaveLength(1);
    expect(tags[0].attrs?.["data-tag"]).toBe("todo");
  });

  it("highlights ==text== and hides the equals signs", () => {
    const doc = "x ==hi== y\n\nend";
    const list = run(doc, doc.length);
    expect(has(list, "cm-highlight")).toBe(true);
    expect(list.filter((i) => i.hide)).toHaveLength(2);
  });

  it("turns task markers into checkbox widgets and strikes done text", () => {
    const doc = "- [ ] open\n- [x] done\n\nend";
    const list = run(doc, doc.length);
    expect(list.filter((i) => i.widget)).toHaveLength(2);
    expect(has(list, "cm-task-done")).toBe(true);
  });

  it("builds callouts with a type class and a header widget", () => {
    const doc = "> [!warning] Heads up\n> body\n\nend";
    const list = run(doc, doc.length);
    expect(list.filter((i) => i.cls.includes("cm-callout-warning")).length).toBe(2);
    expect(list.some((i) => i.widget && i.from === 0)).toBe(true);
    expect(has(list, "cm-callout-first")).toBe(true);
    expect(has(list, "cm-callout-last")).toBe(true);
  });

  it("hides the body of a default-folded callout until the cursor enters it", () => {
    const doc = "> [!note]- Folded\n> secret\n\nend";
    expect(has(run(doc, doc.length), "cm-callout-hidden")).toBe(true);
    expect(has(run(doc, 22), "cm-callout-hidden")).toBe(false);
  });

  it("treats a plain blockquote as a quote, not a callout", () => {
    const list = run("> quoted\n\nend");
    expect(has(list, "cm-quote")).toBe(true);
    expect(list.some((i) => i.cls.includes("cm-callout"))).toBe(false);
  });

  it("styles fenced code blocks and hides fences away from the cursor", () => {
    const doc = "```ts\nconst a = 1;\n```\n\nend";
    const list = run(doc, doc.length);
    expect(list.filter((i) => i.cls.includes("cm-codeblock"))).toHaveLength(3);
    expect(has(list, "cm-cb-head")).toBe(true);
    expect(list.filter((i) => i.hide).length).toBe(2);
    const inside = run(doc, 8);
    expect(has(inside, "cm-cb-head")).toBe(false);
  });

  it("does not decorate markdown inside frontmatter", () => {
    const doc = "---\ntitle: **x**\ntags: [a]\n---\n\n# H";
    const list = run(doc, doc.length);
    expect(list.filter((i) => i.cls === "cm-frontmatter")).toHaveLength(4);
    expect(has(list, "cm-strong")).toBe(false);
    expect(has(list, "cm-h1")).toBe(true);
  });

  it("detects frontmatter bounds and selection touches", () => {
    const s = make("---\na: 1\n---\nbody", 0);
    expect(frontmatterEnd(s.doc)).toBe(12);
    expect(frontmatterEnd(make("no\n---", 0).doc)).toBe(-1);
    expect(touches(s, 0, 5)).toBe(true);
    expect(touches(make("abcdef", 5), 0, 3)).toBe(false);
  });
});
