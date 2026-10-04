"use client";
import { useEffect, useRef, useState } from "react";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { baseExtensions, modeCompartment, spellcheckCompartment, wikilinkCompletion } from "@/lib/ui/editor-ext";
import { livePreview, refreshLivePreview, sourceLinkClicks, syncFocus, type LPContext } from "@/lib/ui/livepreview";
import { renderMarkdown, hydrate } from "@/lib/ui/render";
import { vault } from "@/lib/ui/vault";
import { registerEditor } from "@/lib/ui/editors";
import { openLink, openSearch, addFiles } from "@/lib/ui/actions";
import { ui } from "@/lib/ui/state";
import { findAttachment, basename, parseWikiInner, WIKILINK_RE } from "@/lib/ui/wikilink";
import { notify, errorMessage } from "@/lib/ui/toast";
import type { ViewMode } from "@/lib/ui/commands";

const fromVault = Annotation.define<boolean>();

export interface HoverInfo { target: string; heading?: string; block?: string; rect: DOMRect }

function makeContext(path: string, onHover: (h: HoverInfo | null) => void): LPContext {
  return {
    resolveLink: (t) => vault().resolve(t, path),
    findAttachment: (t) => findAttachment(t, path, vault().listPaths()),
    attachmentUrl: (p) => vault().readAttachmentUrl(p),
    renderInto(el, markdown) {
      el.innerHTML = renderMarkdown(markdown);
      void hydrate(el, { path });
    },
    renderEmbedInto(el, target, heading, block) {
      const d = document.createElement("div");
      d.className = "embed";
      d.dataset.target = target;
      if (heading) d.dataset.heading = heading;
      if (block) d.dataset.block = block;
      el.replaceChildren(d);
      void hydrate(el, { path });
    },
    openLink: (target, o) => void openLink(target, path, o),
    openTag: (tag) => openSearch(`tag:${tag} `),
    openUrl: (url) => { if (/^(https?:|mailto:)/i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); },
    hover: (info) => onHover(info),
  };
}

function modeExtension(mode: ViewMode, ctx: LPContext): Extension {
  return mode === "live" ? livePreview(ctx) : sourceLinkClicks(ctx);
}

export function CMEditor({ path, mode, spellcheck, onHover }: { path: string; mode: Exclude<ViewMode, "reading">; spellcheck: boolean; onHover: (h: HoverInfo | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const ctxRef = useRef<LPContext | null>(null);
  const modeRef = useRef(mode);
  const spellRef = useRef(spellcheck);
  const hoverRef = useRef(onHover);
  const [ready, setReady] = useState(false);
  modeRef.current = mode;
  spellRef.current = spellcheck;
  hoverRef.current = onHover;

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let inflight = 0;
    let lastWritten = "";
    let rafCursor = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const offs: (() => void)[] = [];
    let unregister: (() => void) | null = null;

    const flush = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const view = viewRef.current;
      if (!view || !pending) return;
      pending = false;
      const text = view.state.doc.toString();
      if (text === lastWritten) return;
      inflight++;
      try {
        await vault().write(path, text);
        lastWritten = text;
      } catch (e) {
        pending = true;
        notify(`Could not save ${basename(path)}: ${errorMessage(e)}`, "error");
      } finally {
        inflight--;
      }
    };
    const schedule = () => {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 250);
    };

    const revealNow = () => {
      const view = viewRef.current;
      const r = ui.get().reveal;
      if (!view || !r || r.path !== path) return;
      let line = r.line;
      if (r.heading) {
        const h = vault().parsed(path)?.headings.find((x) => x.text.toLowerCase() === r.heading!.toLowerCase());
        if (h) line = h.line;
      }
      if (line && line >= 1 && line <= view.state.doc.lines) {
        const pos = view.state.doc.line(line).from;
        view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 80 }) });
        view.focus();
      }
      ui.set({ reveal: null });
    };

    void (async () => {
      const text = (await vault().read(path)) ?? "";
      if (disposed || !host.current) return;
      lastWritten = text;
      const ctx = makeContext(path, (h) => hoverRef.current(h));
      ctxRef.current = ctx;

      const files = (e: DataTransfer | null) => Array.from(e?.files ?? []).filter((f) => f.type.startsWith("image/") || f.size > 0);
      const insertFiles = async (view: EditorView, list: File[], at: number) => {
        const added = await addFiles(list);
        if (!added.length || disposed) return;
        const insert = added.map((p) => `![[${p.slice(p.lastIndexOf("/") + 1)}]]`).join("\n");
        view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input.paste" });
      };

      const state = EditorState.create({
        doc: text,
        extensions: baseExtensions({
          mode: modeExtension(modeRef.current, ctx),
          spellcheck: spellRef.current,
          completion: wikilinkCompletion(() => vault().listPaths(), () => path),
          extra: [
            EditorView.updateListener.of((u) => {
              if (u.docChanged && !u.transactions.some((tr) => tr.annotation(fromVault))) schedule();
              if (u.selectionSet && !rafCursor) {
                rafCursor = requestAnimationFrame(() => {
                  rafCursor = 0;
                  const v = viewRef.current;
                  if (v) ui.set({ cursorLine: v.state.doc.lineAt(v.state.selection.main.head).number });
                });
              }
            }),
            EditorView.domEventHandlers({
              blur: () => { void flush(); return false; },
              paste: (e, view) => {
                const list = files(e.clipboardData).filter((f) => f.type.startsWith("image/"));
                if (!list.length) return false;
                e.preventDefault();
                void insertFiles(view, list, view.state.selection.main.head);
                return true;
              },
              drop: (e, view) => {
                const list = files(e.dataTransfer);
                if (!list.length) return false;
                e.preventDefault();
                const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
                void insertFiles(view, list, pos);
                return true;
              },
            }),
          ],
        }),
      });
      const view = new EditorView({ state, parent: host.current });
      viewRef.current = view;
      setReady(true);

      unregister = registerEditor({
        path,
        flush,
        getDoc: () => view.state.doc.toString(),
        applyContent(next) {
          const cur = view.state.doc.toString();
          if (cur === next) return;
          let a = 0;
          const max = Math.min(cur.length, next.length);
          while (a < max && cur.charCodeAt(a) === next.charCodeAt(a)) a++;
          let b = 0;
          while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++;
          view.dispatch({ changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) }, userEvent: "input.properties" });
        },
        revealLine(line) {
          if (line < 1 || line > view.state.doc.lines) return;
          const pos = view.state.doc.line(line).from;
          view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 80 }) });
          view.focus();
        },
        focus: () => view.focus(),
        pending: () => pending || inflight > 0,
      });

      // Changes from outside the editor (pull, merge, link rewrite on rename elsewhere).
      offs.push(vault().subscribe(`note:${path}`, () => {
        if (pending || inflight || timer) return;
        void vault().read(path).then((t) => {
          const v = viewRef.current;
          if (disposed || !v || t == null || pending || inflight || timer) return;
          const cur = v.state.doc.toString();
          if (cur === t) { lastWritten = t; return; }
          let a = 0;
          const max = Math.min(cur.length, t.length);
          while (a < max && cur.charCodeAt(a) === t.charCodeAt(a)) a++;
          let b = 0;
          while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === t.charCodeAt(t.length - 1 - b)) b++;
          lastWritten = t;
          v.dispatch({ changes: { from: a, to: cur.length - b, insert: t.slice(a, t.length - b) }, annotations: [fromVault.of(true)] });
        });
      }));
      // Re-resolve links when the index or tree changes. Widgets (embeds, images, tables) are only
      // rebuilt when what the doc's link targets resolve to has changed, so typing never flickers them.
      let lastSig = "";
      const signature = (doc: string) => {
        const seen = new Set<string>();
        for (const m of doc.matchAll(WIKILINK_RE)) seen.add(parseWikiInner(m[3] !== undefined ? `${m[2]}|${m[3]}` : m[2]).target);
        const paths = vault().listPaths().length;
        return `${paths}:` + [...seen].map((t) => vault().resolve(t, path) ?? "").join("|");
      };
      const refresh = () => {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          const v = viewRef.current;
          if (!v) return;
          const sig = signature(v.state.doc.toString());
          v.dispatch({ effects: refreshLivePreview.of(sig !== lastSig) });
          lastSig = sig;
        }, 150);
      };
      offs.push(vault().subscribe("index", refresh), vault().subscribe("tree", refresh));

      if (ui.get().reveal?.path === path) setTimeout(revealNow, 50);
      else if (document.activeElement === document.body || !document.activeElement) view.focus();
    })();

    const unsubReveal = ui.subscribe(() => { if (ui.get().reveal?.path === path && viewRef.current) revealNow(); });
    const onUnload = () => { void flush(); };
    window.addEventListener("pagehide", onUnload);

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onUnload);
      unsubReveal();
      offs.forEach((o) => o());
      if (refreshTimer) clearTimeout(refreshTimer);
      if (rafCursor) cancelAnimationFrame(rafCursor);
      void flush(); // persist the last edit even though we are unmounting
      unregister?.();
      viewRef.current?.destroy();
      viewRef.current = null;
      ctxRef.current = null;
    };
  }, [path]);

  useEffect(() => {
    const view = viewRef.current;
    const ctx = ctxRef.current;
    if (view && ctx) { view.dispatch({ effects: modeCompartment.reconfigure(modeExtension(mode, ctx)) }); syncFocus(view); }
  }, [mode, ready]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: spellcheckCompartment.reconfigure(EditorView.contentAttributes.of({ spellcheck: spellcheck ? "true" : "false" })) });
  }, [spellcheck, ready]);

  return <div ref={host} className="cm-host" data-mode={mode} data-ready={ready} aria-busy={!ready} />;
}
