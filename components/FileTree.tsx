"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, File as FileIcon, FileText, Folder, FolderOpen, Image as ImageIcon, Pencil, Trash2, FilePlus, FolderPlus, Copy, ExternalLink, Upload } from "lucide-react";
import { ContextMenu, type MenuItem } from "./ui";
import { vault, useVaultVersion } from "@/lib/ui/vault";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { activateTab, addFiles, createFolder, createNote, deleteEntry, moveInto, openNote, renameEntry, toggleFolder } from "@/lib/ui/actions";
import { dirname, isImagePath, isNotePath } from "@/lib/ui/wikilink";
import { notify } from "@/lib/ui/toast";
import type { FileNode } from "@/lib/types";

interface Row { node: FileNode; depth: number }

function flatten(nodes: FileNode[], expanded: Set<string>, depth = 0, out: Row[] = []): Row[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.type === "folder" && expanded.has(n.path) && n.children) flatten(n.children, expanded, depth + 1, out);
  }
  return out;
}

const labelOf = (n: FileNode) => (n.type === "file" && isNotePath(n.path) ? n.name.replace(/\.md$/i, "") : n.name);

export function FileTree({ onUpload }: { onUpload: (dir: string) => void }) {
  const version = useVaultVersion(["tree"]);
  const tree = useMemo(() => vault().tree(), [version]);
  const expandedArr = useStore(ui, (s) => s.expanded);
  const active = useStore(ui, (s) => s.active);
  const expanded = useMemo(() => new Set(expandedArr), [expandedArr]);
  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);
  const [focus, setFocus] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const newFolderIn = useStore(ui, (s) => s.newFolderDir);
  const setNewFolderIn = (d: string | null) => ui.set({ newFolderDir: d });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<{ path: string; type: "file" | "folder" } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reveal the active note: expand its ancestors
  useEffect(() => {
    if (!active) return;
    let d = dirname(active);
    while (d) { toggleFolder(d, true); d = dirname(d); }
  }, [active]);

  const focusPath = focus && rows.some((r) => r.node.path === focus) ? focus : (active && rows.some((r) => r.node.path === active) ? active : rows[0]?.node.path ?? null);

  const moveFocus = (path: string | undefined) => {
    if (!path) return;
    setFocus(path);
    requestAnimationFrame(() => container.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)?.focus());
  };

  const openMenu = (x: number, y: number, node: FileNode | null) => {
    const items: MenuItem[] = [];
    const folder = node ? (node.type === "folder" ? node.path : dirname(node.path)) : "";
    if (node?.type === "file") {
      items.push(
        { label: "Open", icon: <FileText size={16} strokeWidth={1.5} />, onSelect: () => openNote(node.path) },
        { label: "Open in new tab", icon: <ExternalLink size={16} strokeWidth={1.5} />, onSelect: () => openNote(node.path, { newTab: true }) },
        { label: "", separator: true, onSelect: () => {} },
      );
    }
    items.push(
      { label: "New note", icon: <FilePlus size={16} strokeWidth={1.5} />, onSelect: () => void createNote(folder, { newTab: true }) },
      { label: "New folder", icon: <FolderPlus size={16} strokeWidth={1.5} />, onSelect: () => { if (folder) toggleFolder(folder, true); setNewFolderIn(folder); } },
      { label: "Upload files", icon: <Upload size={16} strokeWidth={1.5} />, onSelect: () => onUpload(folder) },
    );
    if (node) {
      items.push(
        { label: "", separator: true, onSelect: () => {} },
        { label: "Rename", icon: <Pencil size={16} strokeWidth={1.5} />, onSelect: () => setRenaming(node.path) },
        { label: "Copy path", icon: <Copy size={16} strokeWidth={1.5} />, onSelect: () => void navigator.clipboard?.writeText(node.path).then(() => notify("Path copied")) },
        { label: node.type === "folder" ? "Delete folder" : "Delete", icon: <Trash2 size={16} strokeWidth={1.5} />, destructive: true, onSelect: () => void deleteEntry(node.path, node.type) },
      );
    }
    setMenu({ x, y, items });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming || (e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.node.path === focusPath);
    const row = rows[i];
    if (!row) return;
    const n = row.node;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); moveFocus(rows[Math.min(rows.length - 1, i + 1)]?.node.path); break;
      case "ArrowUp": e.preventDefault(); moveFocus(rows[Math.max(0, i - 1)]?.node.path); break;
      case "Home": e.preventDefault(); moveFocus(rows[0]?.node.path); break;
      case "End": e.preventDefault(); moveFocus(rows[rows.length - 1]?.node.path); break;
      case "ArrowRight":
        e.preventDefault();
        if (n.type === "folder") { if (!expanded.has(n.path)) toggleFolder(n.path, true); else moveFocus(rows[i + 1]?.node.path); }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (n.type === "folder" && expanded.has(n.path)) toggleFolder(n.path, false);
        else moveFocus(rows.find((r) => r.node.path === dirname(n.path))?.node.path);
        break;
      case "Enter": case " ":
        e.preventDefault();
        if (n.type === "folder") toggleFolder(n.path); else openNote(n.path, { newTab: e.ctrlKey || e.metaKey });
        break;
      case "F2": e.preventDefault(); setRenaming(n.path); break;
      case "Delete": e.preventDefault(); void deleteEntry(n.path, n.type); break;
      case "ContextMenu": case "F10": {
        if (e.key === "F10" && !e.shiftKey) break;
        e.preventDefault();
        const r = (e.target as HTMLElement).getBoundingClientRect();
        openMenu(r.left + 24, r.bottom, n);
        break;
      }
    }
  };

  const commitRename = async (n: FileNode, value: string) => {
    setRenaming(null);
    if (value.trim() && value.trim() !== labelOf(n)) await renameEntry(n.path, value, n.type);
    moveFocus(n.path);
  };

  const dropOn = async (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (e.dataTransfer.files.length && !drag.current) { await addFiles(Array.from(e.dataTransfer.files), folder || "attachments"); return; }
    const d = drag.current;
    drag.current = null;
    if (d) await moveInto(d.path, d.type, folder);
  };
  const canDrop = (folder: string) => {
    const d = drag.current;
    if (!d) return true; // external files
    if (d.path === folder || folder.startsWith(d.path + "/") || dirname(d.path) === folder) return false;
    return true;
  };

  return (
    <div
      ref={container}
      className={`tree ${dropTarget === "" ? "drop-root" : ""}`}
      role="tree"
      aria-label="Files"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); openMenu(e.clientX, e.clientY, null); } }}
      onDragOver={(e) => { if (canDrop("")) { e.preventDefault(); setDropTarget("" ); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropTarget(null); }}
      onDrop={(e) => void dropOn(e, "")}
    >
      {rows.length === 0 && !newFolderIn ? <p className="tree-empty muted">No notes yet. Create one with the New note button.</p> : null}
      {newFolderIn === "" ? <NewFolderRow depth={0} onDone={(name) => { setNewFolderIn(null); if (name) void createFolder("", name); }} /> : null}
      {rows.map(({ node, depth }) => {
        const isFolder = node.type === "folder";
        const open = isFolder && expanded.has(node.path);
        const selected = active === node.path;
        const Icon = isFolder ? (open ? FolderOpen : Folder) : isNotePath(node.path) ? FileText : isImagePath(node.path) ? ImageIcon : FileIcon;
        return (
          <div key={node.path}>
            <div
              role="treeitem"
              data-path={node.path}
              aria-level={depth + 1}
              aria-expanded={isFolder ? open : undefined}
              aria-selected={selected}
              tabIndex={focusPath === node.path ? 0 : -1}
              draggable={renaming !== node.path}
              className={`tree-row ${isFolder ? "is-folder" : ""} ${selected ? "selected" : ""} ${dropTarget === node.path ? "drop-target" : ""}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onFocus={() => setFocus(node.path)}
              onClick={(e) => { if (isFolder) toggleFolder(node.path); else openNote(node.path, { newTab: e.ctrlKey || e.metaKey }); }}
              onAuxClick={(e) => { if (e.button === 1 && !isFolder) { e.preventDefault(); openNote(node.path, { newTab: true }); } }}
              onDoubleClick={(e) => { if (!isFolder) { e.preventDefault(); activateTab(node.path); } }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setFocus(node.path); openMenu(e.clientX, e.clientY, node); }}
              onTouchStart={(e) => { const t = e.touches[0]; press.current = setTimeout(() => openMenu(t.clientX, t.clientY, node), 500); }}
              onTouchEnd={() => press.current && clearTimeout(press.current)}
              onTouchMove={() => press.current && clearTimeout(press.current)}
              onDragStart={(e) => { drag.current = { path: node.path, type: node.type }; e.dataTransfer.setData("text/plain", node.path); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { drag.current = null; setDropTarget(null); }}
              onDragOver={(e) => {
                const target = isFolder ? node.path : dirname(node.path);
                if (!canDrop(target)) return;
                e.preventDefault();
                e.stopPropagation();
                if (isFolder) setDropTarget(node.path);
              }}
              onDragLeave={() => setDropTarget((t) => (t === node.path ? null : t))}
              onDrop={(e) => void dropOn(e, isFolder ? node.path : dirname(node.path))}
            >
              <span className={`tree-chevron ${open ? "open" : ""}`} aria-hidden="true">{isFolder ? <ChevronRight size={14} strokeWidth={1.5} /> : null}</span>
              <Icon size={16} strokeWidth={1.5} className="tree-icon" aria-hidden="true" />
              {renaming === node.path ? (
                <InlineInput
                  defaultValue={labelOf(node)}
                  label={`Rename ${labelOf(node)}`}
                  onDone={(v) => {
                    if (v === null) { setRenaming(null); moveFocus(node.path); } else void commitRename(node, v);
                  }}
                />
              ) : <span className="tree-label">{labelOf(node)}</span>}
              {node.unsynced ? <span className="tree-unsynced" title="Not pushed to GitHub yet"><span className="sr-only">Unsynced</span></span> : null}
            </div>
            {newFolderIn === node.path && open ? <NewFolderRow depth={depth + 1} onDone={(name) => { setNewFolderIn(null); if (name) void createFolder(node.path, name); }} /> : null}
          </div>
        );
      })}
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

function InlineInput({ defaultValue = "", placeholder, label, onDone }: { defaultValue?: string; placeholder?: string; label: string; onDone: (value: string | null) => void }) {
  const done = useRef(false);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input
      className="tree-rename"
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-label={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value || null)}
    />
  );
}

function NewFolderRow({ depth, onDone }: { depth: number; onDone: (name: string | null) => void }) {
  return (
    <div className="tree-row" style={{ paddingLeft: 8 + depth * 12 }}>
      <span className="tree-chevron" aria-hidden="true" />
      <Folder size={16} strokeWidth={1.5} className="tree-icon" aria-hidden="true" />
      <InlineInput placeholder="Folder name" label="New folder name" onDone={onDone} />
    </div>
  );
}
