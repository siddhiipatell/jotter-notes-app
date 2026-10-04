import { StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { parseCalloutHeader, type CalloutHeader } from "./callouts";
import { WIKILINK_RE, parseWikiInner, isImagePath } from "./wikilink";

/**
 * Live Preview: decorations over the Markdown syntax tree. Syntax characters are hidden unless the
 * selection touches the construct, in which case they are dimmed (Ash) and editable. The document
 * text is never changed by any of this.
 */

export interface LPContext {
  resolveLink(target: string): string | null;
  findAttachment(target: string): string | null;
  attachmentUrl(path: string): Promise<string | null>;
  /** render Markdown (sanitised) into el and hydrate links, images, embeds */
  renderInto(el: HTMLElement, markdown: string): void;
  renderEmbedInto(el: HTMLElement, target: string, heading?: string, block?: string): void;
  openLink(target: string, opts: { heading?: string; newTab?: boolean }): void;
  openTag(tag: string): void;
  openUrl(url: string): void;
  hover(info: { target: string; heading?: string; block?: string; rect: DOMRect } | null): void;
}
/** The subset used by the pure decoration builders (testable in node). */
export type BuildContext = Pick<LPContext, "resolveLink" | "findAttachment">;

/** Rebuild decorations. `true` also re-resolves embeds, images and tables (link targets changed). */
export const refreshLivePreview = StateEffect.define<boolean>();
const focusEffect = StateEffect.define<boolean>();

/** Revealing syntax at the cursor only applies while the editor has focus. */
export const focusState = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(focusEffect)) return e.value;
    return v;
  },
});
export const refreshRev = StateField.define<number>({
  create: () => 0,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(refreshLivePreview) && e.value) return v + 1;
    return v;
  },
});
/** Call after (re)configuring the extension on a view that already has focus. */
export function syncFocus(view: EditorView) { if (view.hasFocus) view.dispatch({ effects: focusEffect.of(true) }); }
const rev = (state: EditorState) => state.field(refreshRev, false) ?? 0;
export const toggleCalloutFold = StateEffect.define<number>();

/** Header-line start positions whose fold state was toggled by the user (default state XOR toggled). */
export const calloutToggles = StateField.define<ReadonlySet<number>>({
  create: () => new Set(),
  update(set, tr) {
    let next: Set<number> | null = null;
    if (tr.docChanged && set.size) next = new Set([...set].map((p) => tr.changes.mapPos(p, -1)));
    for (const e of tr.effects) {
      if (e.is(toggleCalloutFold)) {
        next = new Set(next ?? set);
        if (next.has(e.value)) next.delete(e.value); else next.add(e.value);
      }
    }
    return next ?? set;
  },
});

/* ------------------------------------------------------------------ helpers */

const HIDE = Decoration.replace({});
const DIM = Decoration.mark({ class: "cm-syntax" });

export function touches(state: EditorState, from: number, to: number): boolean {
  if (state.field(focusState, false) === false) return false;
  for (const r of state.selection.ranges) if (r.from <= to && r.to >= from) return true;
  return false;
}

/** End offset of the closing `---` line of a leading frontmatter block, or -1. */
export function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== "---") return -1;
  for (let n = 2; n <= doc.lines; n++) {
    const t = doc.line(n).text.trimEnd();
    if (t === "---" || t === "...") return doc.line(n).to;
  }
  return -1;
}

const CODE_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "CommentBlock", "HTMLBlock"]);
function inside(state: EditorState, pos: number, names: Set<string>): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) if (names.has(n.name)) return true;
  return false;
}
const URL_NODES = new Set(["URL", "Autolink"]);

const lineDeco = (cls: string) => Decoration.line({ class: cls });
const markDeco = (cls: string, attributes?: Record<string, string>) => Decoration.mark({ class: cls, attributes });

/* ------------------------------------------------------------------ widgets */

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(o: CheckboxWidget) { return o.checked === this.checked; }
  toDOM(view: EditorView) {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.className = "cm-task-box";
    el.checked = this.checked;
    el.setAttribute("aria-label", this.checked ? "Completed task" : "Incomplete task");
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      const cur = view.state.sliceDoc(pos, pos + 3);
      if (!/^\[[ xX]\]$/.test(cur)) return;
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: cur[1] === " " ? "x" : " " } });
    });
    return el;
  }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(readonly key: string, readonly alt: string, readonly resolve: () => Promise<string | null>, readonly rev = 0) { super(); }
  eq(o: ImageWidget) { return o.key === this.key && o.alt === this.alt && o.rev === this.rev; }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-embed-image";
    const img = document.createElement("img");
    img.alt = this.alt;
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => { wrap.classList.add("cm-embed-missing"); wrap.textContent = this.alt || "Image not found"; view.requestMeasure(); });
    wrap.append(img);
    void this.resolve().then((url) => {
      if (url) img.src = url; else { wrap.classList.add("cm-embed-missing"); wrap.textContent = `Image not found: ${this.alt || this.key}`; }
      view.requestMeasure();
    });
    return wrap;
  }
}

function selectAt(view: EditorView, dom: HTMLElement, atEnd = false) {
  const pos = view.posAtDOM(dom);
  view.dispatch({ selection: { anchor: atEnd ? Math.min(view.state.doc.length, pos) : pos }, scrollIntoView: true });
  view.focus();
}

class TableWidget extends WidgetType {
  constructor(readonly text: string, readonly ctx: LPContext, readonly rev = 0) { super(); }
  eq(o: TableWidget) { return o.text === this.text && o.rev === this.rev; }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-table-widget md-render";
    this.ctx.renderInto(el, this.text);
    el.addEventListener("mousedown", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("a.wikilink, a.tag, a[href^='http']")) return;
      e.preventDefault();
      selectAt(view, el);
    });
    el.addEventListener("click", (e) => handleRenderedClick(e, this.ctx));
    return el;
  }
  ignoreEvent() { return true; }
  get estimatedHeight() { return 40 * (this.text.split("\n").length - 1); }
}

class EmbedWidget extends WidgetType {
  constructor(readonly target: string, readonly heading: string | undefined, readonly block: string | undefined, readonly ctx: LPContext, readonly rev = 0) { super(); }
  eq(o: EmbedWidget) { return o.target === this.target && o.heading === this.heading && o.block === this.block && o.rev === this.rev; }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-embed-widget md-render";
    this.ctx.renderEmbedInto(el, this.target, this.heading, this.block);
    new MutationObserver(() => view.requestMeasure()).observe(el, { childList: true, subtree: true });
    el.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest("a.wikilink, a.tag")) return;
      e.preventDefault();
      selectAt(view, el);
    });
    el.addEventListener("click", (e) => handleRenderedClick(e, this.ctx));
    return el;
  }
  ignoreEvent() { return true; }
}

class PropsWidget extends WidgetType {
  constructor(readonly count: number) { super(); }
  eq(o: PropsWidget) { return o.count === this.count; }
  toDOM(view: EditorView) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm-props-chip";
    b.textContent = `Properties · ${this.count}`;
    b.setAttribute("aria-label", "Edit properties as text");
    b.addEventListener("mousedown", (e) => { e.preventDefault(); selectAt(view, b); });
    return b;
  }
  ignoreEvent() { return true; }
}

class CalloutHeaderWidget extends WidgetType {
  constructor(readonly h: CalloutHeader, readonly folded: boolean) { super(); }
  eq(o: CalloutHeaderWidget) { return o.h.type === this.h.type && o.h.title === this.h.title && o.h.fold === this.h.fold && o.folded === this.folded; }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-callout-head";
    const icon = document.createElement("span");
    icon.className = "callout-icon";
    icon.dataset.icon = this.h.kind;
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "callout-title-text";
    title.textContent = this.h.title;
    el.append(icon, title);
    if (this.h.fold) {
      const chev = document.createElement("button");
      chev.type = "button";
      chev.className = "callout-chevron" + (this.folded ? " folded" : "");
      chev.setAttribute("aria-label", this.folded ? "Expand callout" : "Collapse callout");
      chev.setAttribute("aria-expanded", String(!this.folded));
      chev.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ effects: toggleCalloutFold.of(view.state.doc.lineAt(view.posAtDOM(el)).from) });
      });
      el.append(chev);
    }
    el.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".callout-chevron")) return;
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(el));
      view.dispatch({ selection: { anchor: line.to } });
      view.focus();
    });
    return el;
  }
  ignoreEvent() { return true; }
}

class CopyWidget extends WidgetType {
  constructor(readonly code: string) { super(); }
  eq(o: CopyWidget) { return o.code === this.code; }
  toDOM() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "codeblock-copy";
    b.textContent = "Copy";
    b.setAttribute("aria-label", "Copy code");
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      void navigator.clipboard?.writeText(this.code).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); });
    });
    return b;
  }
  ignoreEvent() { return true; }
}

/** Click delegation for rendered Markdown inside widgets. */
export function handleRenderedClick(e: MouseEvent, ctx: LPContext) {
  const t = e.target as HTMLElement;
  const link = t.closest<HTMLElement>("a.wikilink");
  if (link) {
    e.preventDefault();
    ctx.openLink(link.dataset.target ?? "", { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey });
    return;
  }
  const tag = t.closest<HTMLElement>("a.tag");
  if (tag) { e.preventDefault(); ctx.openTag(tag.dataset.tag ?? ""); }
}

/* ------------------------------------------------------------------ inline decorations */

export function buildInline(state: EditorState, ranges: readonly { from: number; to: number }[], ctx: BuildContext & Partial<LPContext>, hostCtx?: LPContext): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = state.doc;
  const fmEnd = frontmatterEnd(doc);
  const toggles = state.field(calloutToggles, false) ?? new Set<number>();
  const tree = syntaxTree(state);
  const spaceAfter = (to: number) => (doc.sliceString(to, to + 1) === " " ? 1 : 0);
  const hideOrDim = (from: number, to: number, reveal: boolean) => { if (to > from && doc.lineAt(from).number === doc.lineAt(to).number) out.push((reveal ? DIM : HIDE).range(from, to)); };

  if (fmEnd >= 0) {
    const last = doc.lineAt(fmEnd).number;
    for (let n = 1; n <= last; n++) out.push(lineDeco("cm-frontmatter").range(doc.line(n).from));
  }

  for (const r of ranges) {
    tree.iterate({
      from: r.from,
      to: r.to,
      enter: (node) => {
        const name = node.name;
        if (fmEnd >= 0 && node.from <= fmEnd && name !== "Document") return false;
        switch (name) {
          case "ATXHeading1": case "ATXHeading2": case "ATXHeading3": case "ATXHeading4": case "ATXHeading5": case "ATXHeading6":
            out.push(lineDeco(`cm-heading cm-h${name.slice(-1)}`).range(doc.lineAt(node.from).from));
            break;
          case "SetextHeading1": case "SetextHeading2": {
            const a = doc.lineAt(node.from).number, b = doc.lineAt(node.to).number;
            for (let n = a; n <= b; n++) out.push(lineDeco(`cm-heading cm-h${name.slice(-1)}`).range(doc.line(n).from));
            break;
          }
          case "HeaderMark": {
            const parent = node.node.parent;
            if (parent?.name.startsWith("ATXHeading")) {
              const line = doc.lineAt(node.from);
              hideOrDim(node.from, node.to + spaceAfter(node.to), touches(state, line.from, line.to));
            } else out.push(DIM.range(node.from, node.to));
            break;
          }
          case "StrongEmphasis": out.push(markDeco("cm-strong").range(node.from, node.to)); break;
          case "Emphasis": out.push(markDeco("cm-em").range(node.from, node.to)); break;
          case "Strikethrough": out.push(markDeco("cm-strike").range(node.from, node.to)); break;
          case "InlineCode": out.push(markDeco("cm-inline-code").range(node.from, node.to)); break;
          case "EmphasisMark": case "StrikethroughMark": {
            const p = node.node.parent;
            if (p) hideOrDim(node.from, node.to, touches(state, p.from, p.to));
            break;
          }
          case "CodeMark": {
            const p = node.node.parent;
            if (p?.name === "InlineCode") hideOrDim(node.from, node.to, touches(state, p.from, p.to));
            break;
          }
          case "Link": {
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            if (!url || marks.length < 2) break;
            const reveal = touches(state, node.from, node.to);
            out.push(markDeco("cm-link", { "data-url": doc.sliceString(url.from, url.to) }).range(marks[0].to, marks[1].from));
            hideOrDim(marks[0].from, marks[0].to, reveal);
            hideOrDim(marks[1].from, node.to, reveal);
            break;
          }
          case "Image": {
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            if (!url || marks.length < 2) break;
            if (doc.lineAt(node.from).number !== doc.lineAt(node.to).number) break;
            if (touches(state, node.from, node.to)) { out.push(DIM.range(node.from, node.to)); break; }
            const src = doc.sliceString(url.from, url.to).replace(/^<|>$/g, "");
            const alt = doc.sliceString(marks[0].to, marks[1].from);
            const remote = /^(https?:|data:image\/)/i.test(src);
            const attPath = remote ? null : ctx.findAttachment(decodeURI(src));
            const widget = new ImageWidget(remote ? src : (attPath ?? src), alt, async () => (remote ? src : attPath && hostCtx ? hostCtx.attachmentUrl(attPath) : null), rev(state));
            out.push(Decoration.replace({ widget }).range(node.from, node.to));
            return false;
          }
          case "FencedCode": {
            const first = doc.lineAt(node.from), last = doc.lineAt(node.to);
            const touched = touches(state, node.from, node.to);
            const marks = node.node.getChildren("CodeMark");
            const info = node.node.getChild("CodeInfo");
            const closes = marks.length > 1 && doc.lineAt(marks[marks.length - 1].from).number === last.number && last.number !== first.number;
            for (let n = first.number; n <= last.number; n++) {
              const l = doc.line(n);
              let cls = "cm-codeblock" + (n === first.number ? " cm-cb-first" : "") + (n === last.number ? " cm-cb-last" : "");
              if (!touched && n === first.number) cls += " cm-cb-head";
              if (!touched && closes && n === last.number) cls += " cm-cb-foot";
              out.push(lineDeco(cls).range(l.from));
            }
            if (!touched) {
              if (marks[0]) out.push(HIDE.range(marks[0].from, marks[0].to));
              if (closes) out.push(HIDE.range(marks[marks.length - 1].from, marks[marks.length - 1].to));
              if (info) out.push(markDeco("cm-cb-lang").range(info.from, info.to));
              const bodyFrom = first.to + 1;
              const bodyTo = closes ? last.from - 1 : node.to;
              out.push(Decoration.widget({ widget: new CopyWidget(doc.sliceString(bodyFrom, Math.max(bodyFrom, bodyTo))), side: 1 }).range(first.to));
            } else {
              for (const m of marks) out.push(DIM.range(m.from, m.to));
              if (info) out.push(DIM.range(info.from, info.to));
            }
            break;
          }
          case "Blockquote": {
            const first = doc.lineAt(node.from), last = doc.lineAt(node.to);
            const header = parseCalloutHeader(first.text);
            if (header && node.node.parent?.name !== "Blockquote") {
              const touched = touches(state, node.from, node.to);
              let folded = header.fold ? (header.fold === "-") !== toggles.has(first.from) : false;
              if (touched) folded = false;
              for (let n = first.number; n <= last.number; n++) {
                const l = doc.line(n);
                let cls = `cm-callout cm-callout-${header.kind}`;
                if (n === first.number) cls += " cm-callout-first" + (folded ? " cm-callout-folded cm-callout-last" : "");
                if (n === last.number && !folded) cls += " cm-callout-last";
                if (n > first.number && folded) cls += " cm-callout-hidden";
                out.push(lineDeco(cls).range(l.from));
              }
              if (!touched) out.push(Decoration.replace({ widget: new CalloutHeaderWidget(header, folded) }).range(first.from, first.to));
            } else {
              for (let n = first.number; n <= last.number; n++) out.push(lineDeco("cm-quote").range(doc.line(n).from));
            }
            break;
          }
          case "QuoteMark": {
            const line = doc.lineAt(node.from);
            hideOrDim(node.from, node.to + spaceAfter(node.to), touches(state, line.from, line.to));
            break;
          }
          case "HorizontalRule": {
            const line = doc.lineAt(node.from);
            out.push(lineDeco("cm-hr").range(line.from));
            if (!touches(state, line.from, line.to)) out.push(HIDE.range(node.from, node.to));
            break;
          }
          case "ListMark": {
            const li = node.node.parent;
            if (li?.getChild("Task")) {
              const line = doc.lineAt(node.from);
              if (!touches(state, line.from, line.to)) { out.push(HIDE.range(node.from, node.to + spaceAfter(node.to))); break; }
            }
            out.push(markDeco("cm-list-mark").range(node.from, node.to));
            break;
          }
          case "TaskMarker": {
            const checked = /[xX]/.test(doc.sliceString(node.from, node.to));
            out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to));
            const p = node.node.parent;
            if (checked && p && p.to > node.to) out.push(markDeco("cm-task-done").range(node.to, p.to));
            break;
          }
          case "Table": {
            if (touches(state, node.from, node.to) || node.node.parent?.name !== "Document") {
              const a = doc.lineAt(node.from).number, b = doc.lineAt(node.to).number;
              for (let n = a; n <= b; n++) out.push(lineDeco("cm-table-src").range(doc.line(n).from));
            }
            return false;
          }
        }
        return undefined;
      },
    });

    // Regex layer: wikilinks, tags and ==highlights==, outside code.
    for (let pos = r.from; pos <= r.to; ) {
      const line = doc.lineAt(pos);
      pos = line.to + 1;
      if (fmEnd >= 0 && line.to <= fmEnd) continue;
      const text = line.text;
      if (text.includes("[[")) {
        WIKILINK_RE.lastIndex = 0;
        for (let m = WIKILINK_RE.exec(text); m; m = WIKILINK_RE.exec(text)) {
          const from = line.from + m.index, to = from + m[0].length;
          if (inside(state, from, CODE_NODES)) continue;
          const embed = !!m[1];
          const parts = parseWikiInner(m[3] !== undefined ? `${m[2]}|${m[3]}` : m[2]);
          const touched = touches(state, from, to);
          const openEnd = from + (embed ? 3 : 2);
          if (embed && isImagePath(parts.target)) {
            if (touched) { out.push(DIM.range(from, to)); continue; }
            const att = ctx.findAttachment(parts.target);
            out.push(Decoration.replace({ widget: new ImageWidget(att ?? parts.target, parts.alias ?? parts.target, async () => (att && hostCtx ? hostCtx.attachmentUrl(att) : null), rev(state)) }).range(from, to));
            continue;
          }
          if (embed && !touched && text.trim() === m[0]) continue; // solitary note embed: block widget
          const displayFrom = m[3] !== undefined ? openEnd + m[2].length + 1 : openEnd;
          const displayTo = to - 2;
          const unresolved = parts.target !== "" && !ctx.resolveLink(parts.target);
          hideOrDim(from, displayFrom, touched);
          out.push(markDeco("cm-wikilink" + (unresolved ? " cm-wikilink-unresolved" : "") + (embed ? " cm-embed-chip" : ""), {
            "data-target": parts.target, ...(parts.heading ? { "data-heading": parts.heading } : {}), ...(parts.block ? { "data-block": parts.block } : {}),
          }).range(displayFrom, displayTo));
          hideOrDim(displayTo, to, touched);
        }
      }
      if (text.includes("#")) {
        const re = /(^|[\s(,;])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const from = line.from + m.index + m[1].length, to = from + 1 + m[2].length;
          if (inside(state, from, CODE_NODES) || inside(state, from, URL_NODES)) continue;
          out.push(markDeco("cm-tag", { "data-tag": m[2] }).range(from, to));
        }
      }
      if (text.includes("==")) {
        const re = /==(?=\S)([^=\n]+?)(?<=\S)==/g;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const from = line.from + m.index, to = from + m[0].length;
          if (inside(state, from, CODE_NODES)) continue;
          const touched = touches(state, from, to);
          hideOrDim(from, from + 2, touched);
          out.push(markDeco("cm-highlight").range(from + 2, to - 2));
          hideOrDim(to - 2, to, touched);
        }
      }
    }
  }
  return Decoration.set(out, true);
}

/* ------------------------------------------------------------------ block decorations (tables, solitary embeds, frontmatter) */

export function buildBlocks(state: EditorState, ctx: BuildContext & { host?: LPContext }): DecorationSet {
  const host = ctx.host;
  const out: Range<Decoration>[] = [];
  const doc = state.doc;
  const fmEnd = frontmatterEnd(doc);
  if (fmEnd >= 0 && !touches(state, 0, fmEnd) && host) {
    let count = 0;
    for (let n = 2; n <= doc.lineAt(fmEnd).number - 1; n++) if (/^[^\s#-][^:]*:/.test(doc.line(n).text)) count++;
    out.push(Decoration.replace({ widget: new PropsWidget(count), block: true }).range(0, fmEnd));
  }
  const tree = ensureSyntaxTree(state, doc.length, 40) ?? syntaxTree(state);
  if (host) {
    tree.iterate({
      enter: (node) => {
        if (node.name === "Table") {
          if (node.node.parent?.name === "Document" && node.from > fmEnd && !touches(state, node.from, node.to)) {
            out.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(node.from, node.to), host, rev(state)), block: true }).range(node.from, node.to));
          }
          return false;
        }
        return undefined;
      },
    });
    const re = /^\s*!\[\[([^\[\]\r\n|]+?)(?:\|([^\[\]\r\n]*?))?\]\]\s*$/;
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n);
      if (line.to <= fmEnd || !line.text.includes("![[")) continue;
      const m = re.exec(line.text);
      if (!m) continue;
      const parts = parseWikiInner(m[2] !== undefined ? `${m[1]}|${m[2]}` : m[1]);
      if (isImagePath(parts.target) || touches(state, line.from, line.to) || inside(state, line.from, CODE_NODES)) continue;
      out.push(Decoration.replace({ widget: new EmbedWidget(parts.target, parts.heading, parts.block, host, rev(state)), block: true }).range(line.from, line.to));
    }
  }
  return Decoration.set(out, true);
}

/* ------------------------------------------------------------------ extension */

function needsRebuild(u: ViewUpdate) {
  return u.docChanged || u.viewportChanged || u.selectionSet || syntaxTree(u.startState) !== syntaxTree(u.state)
    || u.transactions.some((t) => t.effects.some((e) => e.is(toggleCalloutFold) || e.is(refreshLivePreview) || e.is(focusEffect)));
}

export function livePreview(ctx: LPContext): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildInline(view.state, view.visibleRanges, ctx, ctx); }
      update(u: ViewUpdate) { if (needsRebuild(u)) this.decorations = buildInline(u.state, u.view.visibleRanges, ctx, ctx); }
    },
    { decorations: (v) => v.decorations },
  );
  const blocks = StateField.define<DecorationSet>({
    create: (state) => buildBlocks(state, { ...ctx, host: ctx }),
    update(deco, tr) {
      if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState) || tr.effects.some((e) => e.is(refreshLivePreview) || e.is(focusEffect))) return buildBlocks(tr.state, { ...ctx, host: ctx });
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const handlers = EditorView.domEventHandlers({
    mousedown(e, view) {
      const t = e.target as HTMLElement | null;
      if (!t || e.button !== 0) return false;
      const link = t.closest<HTMLElement>(".cm-wikilink");
      if (link) {
        const pos = view.posAtDOM(link);
        const len = link.textContent?.length ?? 0;
        if (touches(view.state, pos - 3, pos + len + 2) && !(e.ctrlKey || e.metaKey)) return false; // editing this link
        e.preventDefault();
        ctx.openLink(link.dataset.target ?? "", { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey });
        return true;
      }
      const tag = t.closest<HTMLElement>(".cm-tag");
      if (tag && !(e.shiftKey || e.altKey)) { e.preventDefault(); ctx.openTag(tag.dataset.tag ?? ""); return true; }
      const a = t.closest<HTMLElement>(".cm-link");
      if (a && (e.ctrlKey || e.metaKey) && a.dataset.url) {
        e.preventDefault();
        ctx.openUrl(a.dataset.url.replace(/^<|>$/g, ""));
        return true;
      }
      return false;
    },
    mouseover(e) {
      const link = (e.target as HTMLElement | null)?.closest<HTMLElement>(".cm-wikilink");
      if (link) ctx.hover({ target: link.dataset.target ?? "", heading: link.dataset.heading, block: link.dataset.block, rect: link.getBoundingClientRect() });
      return false;
    },
    mouseout(e) {
      if ((e.target as HTMLElement | null)?.closest(".cm-wikilink")) ctx.hover(null);
      return false;
    },
  });
  return [calloutToggles, focusState, refreshRev, EditorView.focusChangeEffect.of((_s, focusing) => focusEffect.of(focusing)), plugin, blocks, handlers];
}

/** In Source mode wikilinks stay raw text; Ctrl/Cmd-click still follows them. */
export function sourceLinkClicks(ctx: Pick<LPContext, "openLink">): Extension {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos);
      WIKILINK_RE.lastIndex = 0;
      for (let m = WIKILINK_RE.exec(line.text); m; m = WIKILINK_RE.exec(line.text)) {
        const from = line.from + m.index;
        if (pos >= from && pos <= from + m[0].length) {
          const parts = parseWikiInner(m[3] !== undefined ? `${m[2]}|${m[3]}` : m[2]);
          e.preventDefault();
          ctx.openLink(parts.target, { heading: parts.heading, newTab: true });
          return true;
        }
      }
      return false;
    },
  });
}
