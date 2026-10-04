"use client";
import { useRef } from "react";
import { FilePlus, FolderPlus, Files, Search, Settings, ChevronsDownUp, Upload, Command } from "lucide-react";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { IconButton, Wordmark, useFocusTrap } from "./ui";
import { ui, LEFT_MIN, LEFT_MAX, RIGHT_MIN, RIGHT_MAX, persistLayout } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { activeFolder, addFiles, closeOverlays, createNote, toggleFolder, setLeftWidth, setModal, setRightWidth, showLeftPanel } from "@/lib/ui/actions";
import { RightPanel } from "./RightPanel";
import { formatShortcut } from "@/lib/ui/commands";
import { IS_MAC } from "./ui";

export function LeftContent() {
  const panel = useStore(ui, (s) => s.leftPanel);
  const repo = useStore(ui, (s) => s.session?.repo);
  const user = useStore(ui, (s) => s.session?.user);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadDir = useRef("");
  const mac = IS_MAC();
  const upload = (dir: string) => { uploadDir.current = dir; fileInput.current?.click(); };
  return (
    <div className="side-content">
      <div className="side-header">
        <Wordmark />
        {repo ? <span className="mono muted small repo-chip" title={`${repo.owner}/${repo.name}@${repo.branch}`}>{repo.name}</span> : null}
      </div>
      <div className="side-toolbar" role="toolbar" aria-label="Sidebar">
        <IconButton label="Files" active={panel === "files"} onClick={() => showLeftPanel("files")}><Files size={20} strokeWidth={1.5} /></IconButton>
        <IconButton label="Search" kbd={formatShortcut("Mod+Shift+F", mac)} active={panel === "search"} onClick={() => showLeftPanel("search")}><Search size={20} strokeWidth={1.5} /></IconButton>
        <span className="toolbar-sep" aria-hidden="true" />
        {panel === "files" ? (
          <>
            <IconButton label="New note" kbd={formatShortcut("Mod+Alt+N", mac)} onClick={() => void createNote(activeFolder(), { newTab: true })}><FilePlus size={20} strokeWidth={1.5} /></IconButton>
            <IconButton label="New folder" onClick={() => { const d = activeFolder(); if (d) toggleFolder(d, true); ui.set({ newFolderDir: d }); }}><FolderPlus size={20} strokeWidth={1.5} /></IconButton>
            <IconButton label="Upload files" onClick={() => upload("")}><Upload size={20} strokeWidth={1.5} /></IconButton>
            <IconButton label="Collapse all folders" onClick={() => { ui.set({ expanded: [] }); persistLayout(); }}><ChevronsDownUp size={20} strokeWidth={1.5} /></IconButton>
          </>
        ) : null}
      </div>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void addFiles(f, uploadDir.current || "attachments"); }} />
      <div className="side-body">
        <div hidden={panel !== "files"} className="side-panel"><FileTree onUpload={upload} /></div>
        <div hidden={panel !== "search"} className="side-panel"><SearchPanel /></div>
      </div>
      <div className="side-footer">
        {user ? (
          <span className="user-chip" title={user.name ?? user.login}>
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" width={20} height={20} />
            ) : <span className="avatar-fallback" aria-hidden="true" />}
            <span className="user-name">{user.login}</span>
          </span>
        ) : <span />}
        <span className="footer-actions">
          <IconButton label="Command palette" kbd={formatShortcut("Mod+P", mac)} tipSide="top" tipEnd onClick={() => setModal("palette")}><Command size={20} strokeWidth={1.5} /></IconButton>
          <IconButton label="Settings" kbd={formatShortcut("Mod+,", mac)} tipSide="top" tipEnd onClick={() => setModal("settings")}><Settings size={20} strokeWidth={1.5} /></IconButton>
        </span>
      </div>
    </div>
  );
}

export function RightContent() { return <RightPanel />; }

export function Resizer({ side }: { side: "left" | "right" }) {
  const width = useStore(ui, (s) => (side === "left" ? s.leftWidth : s.rightWidth));
  const [min, max] = side === "left" ? [LEFT_MIN, LEFT_MAX] : [RIGHT_MIN, RIGHT_MAX];
  const set = side === "left" ? setLeftWidth : setRightWidth;
  const dragging = useRef(false);
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} sidebar`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (dragging.current) set(side === "left" ? e.clientX : window.innerWidth - e.clientX); }}
      onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); persistLayout(); }}
      onDoubleClick={() => { set(side === "left" ? 260 : 280); persistLayout(); }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const dir = side === "left" ? 1 : -1;
        if (e.key === "ArrowLeft") { e.preventDefault(); set(width - step * dir); persistLayout(); }
        if (e.key === "ArrowRight") { e.preventDefault(); set(width + step * dir); persistLayout(); }
      }}
    />
  );
}

export function Sheet({ side, label, children }: { side: "left" | "right"; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeOverlays(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`sheet sheet-${side}`} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeOverlays(); } }}>
        {children}
      </div>
    </div>
  );
}

