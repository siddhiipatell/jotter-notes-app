import { EditorState, EditorSelection, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightSpecialChars, dropCursor, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionSource } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { dirname, isNotePath, noteTitle } from "./wikilink";

/** Syntax colours stay neutral: Ink for code, Graphite for comments, Ink Blue for keywords and strings. */
export const jotterHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "500" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--color-ink-blue)" },
  { tag: t.url, color: "var(--color-slate)" },
  { tag: t.quote, color: "var(--color-graphite)" },
  { tag: [t.processingInstruction, t.contentSeparator], color: "var(--color-ash)" },
  { tag: [t.keyword, t.string, t.regexp, t.atom, t.bool, t.number], color: "var(--color-ink-blue)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--color-graphite)", fontStyle: "italic" },
  { tag: [t.meta, t.documentMeta], color: "var(--color-slate)" },
]);

export const modeCompartment = new Compartment();
export const spellcheckCompartment = new Compartment();

export function wrapSelection(view: EditorView, mark: string): boolean {
  const m = mark.length;
  const spec = view.state.changeByRange((r) => {
    const wrapped = r.from - m >= 0 && view.state.sliceDoc(r.from - m, r.from) === mark && view.state.sliceDoc(r.to, r.to + m) === mark;
    if (wrapped) {
      return { changes: [{ from: r.from - m, to: r.from }, { from: r.to, to: r.to + m }], range: EditorSelection.range(r.from - m, r.to - m) };
    }
    return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: EditorSelection.range(r.from + m, r.to + m) };
  });
  view.dispatch(view.state.update(spec, { userEvent: "input.format", scrollIntoView: true }));
  return true;
}

function insertLink(view: EditorView): boolean {
  const r = view.state.selection.main;
  const sel = view.state.sliceDoc(r.from, r.to);
  const insert = `[${sel}](url)`;
  const urlFrom = r.from + sel.length + 3;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor: urlFrom, head: urlFrom + 3 }, userEvent: "input.format" });
  return true;
}

/** Tab indents list items; elsewhere it moves focus (so the editor is not a keyboard trap). */
function tabInList(view: EditorView, indent: boolean): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  if (!/^\s*([-*+]|\d+[.)])\s/.test(line.text)) return false;
  return indent ? indentMore(view) : indentLess(view);
}

export function wikilinkCompletion(getPaths: () => string[], fromPath: () => string): CompletionSource {
  return (cx) => {
    const before = cx.matchBefore(/\[\[[^\[\]\n|#]*$/);
    if (!before) return null;
    const isEmbed = cx.state.sliceDoc(Math.max(0, before.from - 1), before.from) === "!";
    const all = getPaths();
    const notes = all.filter(isNotePath);
    const counts = new Map<string, number>();
    for (const p of notes) counts.set(noteTitle(p), (counts.get(noteTitle(p)) ?? 0) + 1);
    const here = fromPath();
    const options = [
      ...notes.filter((p) => p !== here).map((p) => ({
        label: counts.get(noteTitle(p)) === 1 ? noteTitle(p) : p.replace(/\.md$/i, ""),
        detail: dirname(p),
        type: "text",
      })),
      ...(isEmbed ? all.filter((p) => !isNotePath(p) && !p.startsWith(".")).map((p) => ({ label: p.slice(p.lastIndexOf("/") + 1), detail: dirname(p), type: "text" })) : []),
    ].map((o) => ({
      ...o,
      apply: (view: EditorView, _c: unknown, from: number, to: number) => {
        const after = view.state.sliceDoc(to, to + 2);
        const insert = o.label + (after === "]]" ? "" : "]]");
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + (after === "]]" ? 2 : 0) }, userEvent: "input.complete" });
      },
    }));
    return { from: before.from + 2, options, validFor: /^[^\[\]\n|#]*$/ };
  };
}

export interface EditorExtOptions {
  mode: Extension;
  spellcheck: boolean;
  extra: Extension[];
  completion: CompletionSource;
  placeholderText?: string;
}

export function baseExtensions(o: EditorExtOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    highlightSpecialChars(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    closeBrackets(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    syntaxHighlighting(jotterHighlight),
    autocompletion({ override: [o.completion], icons: false, maxRenderedOptions: 40, defaultKeymap: true }),
    keymap.of([
      { key: "Mod-b", run: (v) => wrapSelection(v, "**") },
      { key: "Mod-i", run: (v) => wrapSelection(v, "*") },
      { key: "Mod-k", run: insertLink },
      { key: "Tab", run: (v) => tabInList(v, true) },
      { key: "Shift-Tab", run: (v) => tabInList(v, false) },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.contentAttributes.of({ "aria-label": "Note editor", "aria-multiline": "true", autocapitalize: "sentences" }),
    spellcheckCompartment.of(EditorView.contentAttributes.of({ spellcheck: o.spellcheck ? "true" : "false" })),
    modeCompartment.of(o.mode),
    placeholder(o.placeholderText ?? "Start writing…"),
    ...o.extra,
  ];
}
