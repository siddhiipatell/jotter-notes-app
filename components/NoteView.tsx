"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { CMEditor, type HoverInfo } from "./CMEditor";
import { Button } from "./ui";
import { vault } from "@/lib/ui/vault";
import { renderMarkdown, hydrate } from "@/lib/ui/render";
import { extractSection, isImagePath, noteTitle, basename } from "@/lib/ui/wikilink";
import { toggleNthTask } from "@/lib/ui/tasks";
import { openLink, openSearch, renameEntry } from "@/lib/ui/actions";
import { getEditor } from "@/lib/ui/editors";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { useSettings } from "@/lib/ui/settings";
import { notify, errorMessage } from "@/lib/ui/toast";

/* ------------------------------------------------------------------ title */

let handledNonce = 0;

function NoteTitle({ path }: { path: string }) {
  const title = noteTitle(path);
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const nonce = useStore(ui, (s) => s.focusTitleNonce);
  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    if (nonce !== handledNonce) {
      handledNonce = nonce;
      input.current?.focus();
      input.current?.select();
    }
  }, [nonce]);
  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) { setValue(title); return; }
    const ok = await renameEntry(path, next, "file");
    if (!ok) setValue(title);
  };
  return (
    <input
      ref={input}
      className="note-title"
      value={value}
      aria-label="Note title (file name)"
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); input.current?.blur(); setTimeout(() => getEditor(path)?.focus(), 0); }
        if (e.key === "Escape") { setValue(title); input.current?.blur(); }
      }}
    />
  );
}

/* ------------------------------------------------------------------ hover preview */

function HoverPreview({ info, fromPath }: { info: HoverInfo | null; fromPath: string }) {
  const [shown, setShown] = useState<HoverInfo | null>(null);
  const over = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (info) setShown(info);
      else if (!over.current) setShown(null);
    }, info ? 350 : 200);
    return () => clearTimeout(t);
  }, [info]);
  useEffect(() => {
    let cancelled = false;
    const el = body.current;
    if (!shown || !el) return;
    el.textContent = "";
    const resolved = shown.target ? vault().resolve(shown.target, fromPath) : fromPath;
    if (!resolved) { el.textContent = "This note does not exist yet. Click the link to create it."; el.classList.add("muted"); return; }
    el.classList.remove("muted");
    void vault().read(resolved).then(async (text) => {
      if (cancelled || !text) return;
      const section = extractSection(text, shown.heading, shown.block).slice(0, 2000);
      el.innerHTML = renderMarkdown(section);
      await hydrate(el, { path: resolved, depth: 2 });
    });
    return () => { cancelled = true; };
  }, [shown, fromPath]);
  if (!shown) return null;
  const left = Math.max(8, Math.min(shown.rect.left, window.innerWidth - 436));
  const below = shown.rect.bottom + 8;
  const top = below + 320 > window.innerHeight ? Math.max(8, shown.rect.top - 8 - 320) : below;
  return (
    <div className="hover-preview" role="tooltip" style={{ left, top }} onMouseEnter={() => { over.current = true; }} onMouseLeave={() => { over.current = false; setShown(null); }}>
      <div className="hover-preview-title mono">{shown.target || noteTitle(fromPath)}{shown.heading ? ` › ${shown.heading}` : ""}</div>
      <div ref={body} className="hover-preview-body md-render" />
    </div>
  );
}

/* ------------------------------------------------------------------ reading mode */

function ReadingView({ path, onHover }: { path: string; onHover: (h: HoverInfo | null) => void }) {
  const [text, setText] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const load = useCallback(() => { void vault().read(path).then((t) => setText(t ?? "")); }, [path]);
  useEffect(() => { load(); return vault().subscribe(`note:${path}`, load); }, [path, load]);
  const html = useMemo(() => (text == null ? "" : renderMarkdown(text)), [text]);
  useEffect(() => {
    const el = root.current;
    if (!el || text == null) return;
    el.innerHTML = html;
    void hydrate(el, { path }).then(() => {
      const r = ui.get().reveal;
      if (r && r.path === path && r.heading) {
        const h = Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6")).find((x) => x.textContent?.trim().toLowerCase() === r.heading!.toLowerCase());
        h?.scrollIntoView({ block: "start" });
      }
      if (r && r.path === path) ui.set({ reveal: null });
    });
  }, [html, path, text]);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const link = t.closest<HTMLElement>("a.wikilink");
    if (link) { e.preventDefault(); void openLink(link.dataset.target ?? "", path, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey }); return; }
    const tag = t.closest<HTMLElement>("a.tag");
    if (tag) { e.preventDefault(); openSearch(`tag:${tag.dataset.tag} `); return; }
    const box = t.closest<HTMLInputElement>("input.task-checkbox");
    if (box && text != null) {
      e.preventDefault();
      const next = toggleNthTask(text, Number(box.dataset.taskIndex));
      if (next != null) { setText(next); vault().write(path, next).catch((err) => notify(errorMessage(err), "error")); }
    }
  };
  const onOver = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>("a.wikilink");
    if (link) onHover({ target: link.dataset.target ?? "", heading: link.dataset.heading, block: link.dataset.block, rect: link.getBoundingClientRect() });
  };
  const onOut = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest("a.wikilink")) onHover(null); };
  return (
    <div
      ref={root}
      className="reading md-render"
      role="document"
      aria-label="Reading view"
      tabIndex={0}
      onClick={onClick}
      onMouseOver={onOver}
      onMouseOut={onOut}
    />
  );
}

/* ------------------------------------------------------------------ attachments */

function AttachmentView({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    setUrl(undefined);
    void vault().readAttachmentUrl(path).then((u) => { if (!off) setUrl(u); });
    return () => { off = true; };
  }, [path]);
  const name = basename(path);
  const isPdf = /\.pdf$/i.test(path);
  return (
    <div className="editor-scroll">
      <div className="note-column">
        <h1 className="note-title static">{name}</h1>
        <p className="mono muted small">{path}</p>
        {url === undefined ? <p className="muted">Loading</p> : url === null ? <p className="muted">This file could not be loaded.</p> : isImagePath(path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="attachment-image" src={url} alt={name} />
        ) : isPdf ? (
          <iframe className="attachment-pdf" src={url} title={name} sandbox="" />
        ) : (
          <a href={url} download={name}><Button><Download size={16} strokeWidth={1.5} /> Download {name}</Button></a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ note view */

export function NoteView({ path }: { path: string }) {
  const mode = useStore(ui, (s) => s.mode);
  const { spellcheck } = useSettings();
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const onHover = useCallback((h: HoverInfo | null) => setHover(h), []);
  if (!path.toLowerCase().endsWith(".md")) return <AttachmentView path={path} />;
  return (
    <div className="editor-scroll" id="note-panel" role="tabpanel" aria-label={noteTitle(path)}>
      <div className="note-column">
        <NoteTitle path={path} />
        {mode === "reading" ? <ReadingView key={path} path={path} onHover={onHover} /> : <CMEditor key={path} path={path} mode={mode} spellcheck={spellcheck} onHover={onHover} />}
      </div>
      <HoverPreview info={hover} fromPath={path} />
    </div>
  );
}
