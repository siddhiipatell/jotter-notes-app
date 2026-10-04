"use client";
import { useMemo, useRef } from "react";
import { Command, FilePlus, Files, Link2, Lock, PanelLeft, PanelRight, RefreshCw, Search, Settings, X, CalendarDays, FileText, Plus } from "lucide-react";
import { Button, IconButton, KbdKeys, Segmented, Spinner, StatusDot, IS_MAC } from "./ui";
import { LeftContent, Resizer, RightContent, Sheet } from "./Sidebar";
import { NoteView } from "./NoteView";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { vault, useVaultVersion } from "@/lib/ui/vault";
import { useConflicts, useSyncState, unsyncedPaths } from "@/lib/ui/sync";
import { activateTab, closeOverlays, closeTab, createNote, openDaily, pullNow, pushNow, setMode, setModal, showLeftPanel, toggleLeft, toggleRight } from "@/lib/ui/actions";
import { formatShortcut, shortcutKeys, type ViewMode } from "@/lib/ui/commands";
import { noteTitle, basename } from "@/lib/ui/wikilink";

/* ------------------------------------------------------------------ tab strip */

function TabStrip() {
  const tabs = useStore(ui, (s) => s.tabs);
  const active = useStore(ui, (s) => s.active);
  const bp = useStore(ui, (s) => s.bp);
  const mode = useStore(ui, (s) => s.mode);
  const leftOpen = useStore(ui, (s) => s.leftOpen);
  const rightOpen = useStore(ui, (s) => s.rightOpen);
  const v = useVaultVersion(["tree"]);
  const unsynced = useMemo(() => unsyncedPaths(vault().tree()), [v]);
  const mac = IS_MAC();
  const list = useRef<HTMLDivElement>(null);
  const isNote = !!active && active.toLowerCase().endsWith(".md");
  const cycle = formatShortcut("Mod+E", mac);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (e.key === "ArrowRight") to = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") to = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = tabs.length - 1;
    else if (e.key === "Delete" || (e.key === "w" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeTab(tabs[i]); return; }
    if (to >= 0) {
      e.preventDefault();
      activateTab(tabs[to]);
      requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("[role=tab]")[to]?.focus());
    }
  };

  return (
    <div className="tab-strip">
      <IconButton label={bp === "wide" ? "Toggle left sidebar" : "Files"} kbd={formatShortcut("Mod+\\", mac)} active={bp === "wide" ? leftOpen : false} onClick={toggleLeft}><PanelLeft size={20} strokeWidth={1.5} /></IconButton>
      <div className="tabs-area">
        <div ref={list} className="tabs" role="tablist" aria-label="Open notes">
          {tabs.map((p, i) => {
            const isActive = p === active;
            const dirty = unsynced.has(p);
            return (
              <div key={p} role="presentation" className={`tab ${isActive ? "active" : ""} ${dirty ? "dirty" : ""}`} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(p); } }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={isActive ? "note-panel" : undefined}
                  tabIndex={isActive || (!active && i === 0) ? 0 : -1}
                  className="tab-btn"
                  onClick={() => activateTab(p)}
                  onKeyDown={(e) => onKey(e, i)}
                  title={p}
                  aria-keyshortcuts="Delete"
                >
                  <span className="tab-label">{p.toLowerCase().endsWith(".md") ? noteTitle(p) : basename(p)}</span>
                  {dirty ? <span className="tab-dot" aria-hidden="true" /> : null}
                  {dirty ? <span className="sr-only">unsynced</span> : null}
                </button>
                <span className="tab-close" aria-hidden="true" onClick={() => closeTab(p)}><X size={12} strokeWidth={2} /></span>
              </div>
            );
          })}
        </div>
        <IconButton label="New note" className="tab-new" onClick={() => void createNote(undefined, { newTab: true })}><Plus size={16} strokeWidth={1.5} /></IconButton>
      </div>
      {isNote ? (
        <Segmented<ViewMode>
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "source", label: "Source", kbd: cycle },
            { value: "live", label: "Live", kbd: cycle },
            { value: "reading", label: "Reading", kbd: cycle },
          ]}
        />
      ) : null}
      <IconButton label={bp === "wide" ? "Toggle right sidebar" : "Backlinks and properties"} kbd={formatShortcut("Mod+Shift+\\", mac)} active={bp === "wide" ? rightOpen : false} onClick={toggleRight}><PanelRight size={20} strokeWidth={1.5} /></IconButton>
    </div>
  );
}

/* ------------------------------------------------------------------ notice bar */

function NoticeBar() {
  const sync = useSyncState();
  const conflicts = useConflicts();
  let node: React.ReactNode = null;
  if (conflicts.length > 0 || sync.kind === "conflict") {
    const n = conflicts.length || (sync.kind === "conflict" ? sync.count : 0);
    node = <><StatusDot kind="conflict" /> {n} note{n === 1 ? " has" : "s have"} changes in two places. <button type="button" className="link-btn" onClick={() => setModal("conflicts", conflicts[0]?.path ?? null)}>Compare versions</button></>;
  } else if (sync.kind === "offline") {
    node = <><StatusDot kind="offline" /> You are offline. Changes are saved on this device and will sync when you reconnect.</>;
  } else if (sync.kind === "error") {
    node = <><StatusDot kind="conflict" /> Sync failed: {sync.message}. <button type="button" className="link-btn" onClick={() => void pushNow()}>Try again</button></>;
  }
  if (!node) return null;
  return <div className="notice-bar" role="status">{node}</div>;
}

/* ------------------------------------------------------------------ status bar */

function StatusBar() {
  const sync = useSyncState();
  const encrypted = useStore(ui, (s) => s.encrypted);
  const active = useStore(ui, (s) => s.active);
  const v = useVaultVersion(active ? [`note:${active}`, "index"] : ["index"]);
  const words = useMemo(() => (active && active.endsWith(".md") ? vault().parsed(active)?.wordCount : undefined), [active, v]);
  let item: React.ReactNode;
  switch (sync.kind) {
    case "synced": item = <><StatusDot kind="synced" /><span>Synced</span></>; break;
    case "unsynced": item = <><StatusDot kind="pending" /><span><span className="mono">{sync.count}</span> unsynced</span></>; break;
    case "syncing": item = <><Spinner /><span>Syncing</span></>; break;
    case "offline": item = <><StatusDot kind="offline" /><span>Offline</span></>; break;
    case "conflict": item = (
      <button type="button" className="status-pill" onClick={() => setModal("conflicts", vault().conflicts()[0]?.path ?? null)} aria-label={`Conflict in ${sync.count} notes. Open resolver`}>
        <StatusDot kind="conflict" /><span>Conflict</span><span className="mono">{sync.count}</span>
      </button>
    ); break;
    case "error": item = <><StatusDot kind="conflict" /><span title={sync.message}>Sync error</span></>; break;
  }
  const canPush = sync.kind === "unsynced" || sync.kind === "error";
  return (
    <footer className="status-bar">
      <div className="status-item" role="status" aria-live="polite" aria-atomic="true">{item}</div>
      {canPush ? <Button variant="primary" size="xs" onClick={() => void pushNow()}>Push now</Button> : null}
      <IconButton label="Pull from GitHub" className="sm" onClick={() => void pullNow()}><RefreshCw size={14} strokeWidth={1.5} /></IconButton>
      <span className="status-spacer" />
      {words !== undefined ? <span className="status-item"><span className="mono">{words.toLocaleString()}</span> {words === 1 ? "word" : "words"}</span> : null}
      {encrypted ? <span className="status-item" title="Notes are encrypted before they are pushed to GitHub"><Lock size={12} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">Encrypted</span></span> : null}
    </footer>
  );
}

/* ------------------------------------------------------------------ mobile */

function MobileBar() {
  const sheet = useStore(ui, (s) => s.sheet);
  const modal = useStore(ui, (s) => s.modal);
  const items: { key: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }[] = [
    { key: "files", label: "Files", icon: <Files size={24} strokeWidth={1.5} />, active: sheet === "files", onClick: () => (sheet === "files" ? closeOverlays() : showLeftPanel("files")) },
    { key: "search", label: "Search", icon: <Search size={24} strokeWidth={1.5} />, active: sheet === "search", onClick: () => (sheet === "search" ? closeOverlays() : showLeftPanel("search")) },
    { key: "new", label: "New note", icon: <FilePlus size={24} strokeWidth={1.5} />, active: false, onClick: () => void createNote(undefined, { newTab: true }) },
    { key: "right", label: "Backlinks", icon: <Link2 size={24} strokeWidth={1.5} />, active: sheet === "right", onClick: toggleRight },
    { key: "settings", label: "Settings", icon: <Settings size={24} strokeWidth={1.5} />, active: modal === "settings", onClick: () => setModal("settings") },
  ];
  return (
    <nav className="bottom-bar" aria-label="Primary">
      {items.map((it) => (
        <button key={it.key} type="button" className={`bb-btn ${it.active ? "active" : ""}`} aria-label={it.label} aria-pressed={it.key === "new" ? undefined : it.active} onClick={it.onClick}>
          {it.icon}
          {it.active ? <span className="bb-dot" aria-hidden="true" /> : null}
        </button>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ empty state */

function EmptyState() {
  const mac = IS_MAC();
  return (
    <div className="empty dot-grid">
      <section className="card empty-card" aria-labelledby="empty-title">
        <h1 id="empty-title" className="heading-lg">No note open</h1>
        <p className="muted">Pick a note from the sidebar, or start something new.</p>
        <div className="empty-actions">
          <Button variant="primary" size="lg" onClick={() => void createNote(undefined, { newTab: true })}><FilePlus size={16} strokeWidth={1.5} /> Create new note</Button>
          <Button size="lg" onClick={() => setModal("switcher")}><FileText size={16} strokeWidth={1.5} /> Go to note <KbdKeys keys={shortcutKeys("Mod+O", mac)} /></Button>
          <Button size="lg" onClick={() => void openDaily()}><CalendarDays size={16} strokeWidth={1.5} /> Open daily note</Button>
          <Button size="lg" onClick={() => setModal("palette")}><Command size={16} strokeWidth={1.5} /> Commands <KbdKeys keys={shortcutKeys("Mod+P", mac)} /></Button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

export function Shell() {
  const bp = useStore(ui, (s) => s.bp);
  const leftOpen = useStore(ui, (s) => s.leftOpen);
  const rightOpen = useStore(ui, (s) => s.rightOpen);
  const leftWidth = useStore(ui, (s) => s.leftWidth);
  const rightWidth = useStore(ui, (s) => s.rightWidth);
  const overlayLeft = useStore(ui, (s) => s.overlayLeft);
  const overlayRight = useStore(ui, (s) => s.overlayRight);
  const sheet = useStore(ui, (s) => s.sheet);
  const active = useStore(ui, (s) => s.active);
  const wide = bp === "wide";
  return (
    <div className="app">
      <div className="app-body">
        {wide && leftOpen ? (
          <>
            <aside className="sidebar sidebar-left" style={{ width: leftWidth }} aria-label="Sidebar"><div className="side-inner"><LeftContent /></div><Resizer side="left" /></aside>
          </>
        ) : null}
        <main className="editor-area">
          <h1 className="sr-only">{active ? noteTitle(active) : "Jotter"}</h1>
          <TabStrip />
          <NoticeBar />
          <div className="editor-content">{active ? <NoteView key={active} path={active} /> : <EmptyState />}</div>
        </main>
        {wide && rightOpen ? (
          <>
            <aside className="sidebar sidebar-right" style={{ width: rightWidth }} aria-label="Backlinks, outline and properties"><Resizer side="right" /><div className="side-inner"><RightContent /></div></aside>
          </>
        ) : null}
      </div>
      <StatusBar />
      {bp === "narrow" ? <MobileBar /> : null}
      {bp === "mid" && overlayLeft ? <Sheet side="left" label="Sidebar"><LeftContent /></Sheet> : null}
      {bp === "mid" && overlayRight ? <Sheet side="right" label="Backlinks, outline and properties"><RightContent /></Sheet> : null}
      {bp === "narrow" && (sheet === "files" || sheet === "search") ? <Sheet side="left" label="Sidebar"><LeftContent /></Sheet> : null}
      {bp === "narrow" && sheet === "right" ? <Sheet side="right" label="Backlinks, outline and properties"><RightContent /></Sheet> : null}
    </div>
  );
}
