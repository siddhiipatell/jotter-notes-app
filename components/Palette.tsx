"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, FilePlus, Search } from "lucide-react";
import { KbdKeys, Kbd, Modal, IS_MAC } from "./ui";
import { registry, shortcutKeys, type Command } from "@/lib/ui/commands";
import { buildCommandContext, createNote, openNote, setModal } from "@/lib/ui/actions";
import { vault } from "@/lib/ui/vault";
import { ui } from "@/lib/ui/state";
import { chipsToString, extractChips, matchesChips, parseOperators, type OperatorChip } from "@/lib/ui/fuzzy";
import { noteTitle } from "@/lib/ui/wikilink";

interface FileItem { kind: "file"; path: string; title: string }
interface CreateItem { kind: "create"; name: string }
type Item = ({ kind: "command"; cmd: Command }) | FileItem | CreateItem;

function useItems(mode: "commands" | "files", text: string, chips: OperatorChip[]): Item[] {
  return useMemo(() => {
    if (mode === "commands") return registry.search(text, buildCommandContext()).map((cmd) => ({ kind: "command" as const, cmd }));
    const v = vault();
    const live = parseOperators(`${chipsToString(chips)} ${text}`);
    const tagsOf = (p: string) => v.parsed(p)?.tags ?? [];
    let found: { path: string; title: string }[];
    if (live.text) found = v.quickSwitch(live.text, 50);
    else if (live.chips.length) found = v.listPaths().filter((p) => p.endsWith(".md")).map((p) => ({ path: p, title: noteTitle(p) }));
    else {
      const paths = new Set(v.listPaths());
      const recent = ui.get().recent.filter((p) => paths.has(p));
      const rest = v.listPaths().filter((p) => p.endsWith(".md") && !recent.includes(p));
      found = [...recent, ...rest].slice(0, 12).map((p) => ({ path: p, title: p.endsWith(".md") ? noteTitle(p) : p }));
    }
    const items: Item[] = found.filter((f) => matchesChips(live.chips, f.path, tagsOf(f.path))).slice(0, 50).map((f) => ({ kind: "file" as const, ...f }));
    const name = live.text.trim();
    if (name && !items.some((i) => i.kind === "file" && i.title.toLowerCase() === name.toLowerCase())) items.push({ kind: "create", name });
    return items;
  }, [mode, text, chips]);
}

export function Palette({ mode }: { mode: "commands" | "files" }) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState<OperatorChip[]>([]);
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const mac = IS_MAC();
  const items = useItems(mode, text, chips);
  const idx = Math.min(sel, Math.max(0, items.length - 1));
  const close = () => setModal(null);

  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx, items]);

  const choose = (item: Item | undefined, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
    if (!item) return;
    const newTab = !!(e?.ctrlKey || e?.metaKey);
    if (item.kind === "command") { const ctx = buildCommandContext(); close(); item.cmd.run(ctx); return; }
    close();
    if (item.kind === "file") openNote(item.path, { newTab });
    else void createNote("", { name: item.name.replace(/[\\/:*?"<>|]/g, "-"), newTab });
  };

  const onText = (value: string) => {
    if (mode === "files") {
      const x = extractChips(value);
      if (x.chips.length) { setChips((c) => [...c, ...x.chips]); setText(x.rest); setSel(0); return; }
    }
    setText(value);
    setSel(0);
  };

  return (
    <Modal onClose={close} label={mode === "commands" ? "Command palette" : "Quick switcher"} className="palette" align="top">
      <div className="palette-input">
        <Search size={20} strokeWidth={1.5} aria-hidden="true" />
        {chips.map((c, i) => <span key={i} className="op-chip mono">{c.op}:{c.value}</span>)}
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items.length ? `pal-${idx}` : undefined}
          aria-label={mode === "commands" ? "Search commands" : "Search notes"}
          placeholder={mode === "commands" ? "Type a command" : "Find or create a note (tag:, path:)"}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(items.length - 1, idx + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(0, idx - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(e.shiftKey && text.trim() ? { kind: "create", name: text.trim() } : items[idx], e); }
            else if (e.key === "Backspace" && !text && chips.length) setChips((c) => c.slice(0, -1));
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div ref={list} id="palette-list" role="listbox" aria-label="Results" className="palette-list">
        {items.map((item, i) => (
          <div
            key={item.kind === "command" ? item.cmd.id : item.kind === "file" ? item.path : "create"}
            id={`pal-${i}`}
            data-i={i}
            role="option"
            aria-selected={i === idx}
            className={`palette-row ${i === idx ? "selected" : ""}`}
            onMouseMove={() => setSel(i)}
            onClick={(e) => choose(item, e)}
          >
            {item.kind === "create" ? <FilePlus size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
            <span className="pr-title">{item.kind === "command" ? item.cmd.title : item.kind === "file" ? item.title : `Create “${item.name}”`}</span>
            <span className="pr-meta">
              {item.kind === "command" ? (item.cmd.shortcut ? <KbdKeys keys={shortcutKeys(item.cmd.shortcut, mac)} /> : <span className="mono">{item.cmd.description}</span>) : null}
              {item.kind === "file" ? <span className="mono">{item.path}</span> : null}
              {item.kind === "create" ? <span className="mono">New note</span> : null}
            </span>
            {i === idx ? <CornerDownLeft size={14} strokeWidth={1.75} className="pr-return" aria-label="Press Enter" /> : null}
          </div>
        ))}
        {items.length === 0 ? <p className="muted pad" role="status">{mode === "commands" ? "No matching commands." : "No matching notes."}</p> : null}
      </div>
      <div className="palette-foot">
        <span><KbdKeys keys={["↑", "↓"]} /> navigate</span>
        <span><Kbd>↵</Kbd> {mode === "commands" ? "run" : "open"}</span>
        {mode === "files" ? <span><KbdKeys keys={[mac ? "⌘" : "Ctrl", "↵"]} /> new tab</span> : null}
        <span><Kbd>Esc</Kbd> close</span>
      </div>
    </Modal>
  );
}
