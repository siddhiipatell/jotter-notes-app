"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight as ChevronR, Plus, X } from "lucide-react";
import { Chip, SectionHeader, Switch } from "./ui";
import { vault, useVaultVersion } from "@/lib/ui/vault";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { openNote } from "@/lib/ui/actions";
import { getEditor } from "@/lib/ui/editors";
import { setFrontmatterProperty } from "@/lib/core/markdown";
import { notify, errorMessage } from "@/lib/ui/toast";
import type { Backlink, Heading } from "@/lib/types";

/* ------------------------------------------------------------------ backlinks */

function Snippet({ text }: { text: string }) {
  const parts = text.trim().split(/(!?\[\[[^\]]+\]\])/g);
  return <>{parts.map((p, i) => (/^!?\[\[/.test(p) ? <span key={i} className="bl-link">{p}</span> : <span key={i}>{p}</span>))}</>;
}

function Backlinks({ path }: { path: string }) {
  const v = useVaultVersion(["index", "tree"]);
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; items: Backlink[] }>();
    for (const b of vault().backlinks(path)) {
      const g = m.get(b.fromPath) ?? { title: b.fromTitle, items: [] };
      g.items.push(b);
      m.set(b.fromPath, g);
    }
    return [...m.entries()];
  }, [path, v]);
  return (
    <section aria-labelledby="bl-h" className="rp-section">
      <div id="bl-h"><SectionHeader n="01" label="Backlinks" as="h2" /></div>
      {groups.length === 0 ? <p className="muted small">No other note links here yet. Type [[ in any note to link to this one.</p> : (
        <ul className="bl-list">
          {groups.map(([from, g]) => (
            <li key={from}>
              <button type="button" className="bl-card" onClick={(e) => openNote(from, { line: g.items[0].line, newTab: e.ctrlKey || e.metaKey })}>
                <span className="bl-head"><span className="bl-title">{g.title}</span><span className="mono muted small" aria-label={`${g.items.length} mention${g.items.length === 1 ? "" : "s"}`}>{g.items.length}</span></span>
                {g.items.slice(0, 3).map((b, i) => <span key={i} className="bl-context"><Snippet text={b.context} /></span>)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ outline */

function gotoHeading(path: string, h: Heading) {
  if (ui.get().mode === "reading") {
    const el = Array.from(document.querySelectorAll(".reading h1,.reading h2,.reading h3,.reading h4,.reading h5,.reading h6")).find((x) => x.textContent?.trim() === h.text);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  } else getEditor(path)?.revealLine(h.line);
}

function Outline({ path }: { path: string }) {
  const v = useVaultVersion([`note:${path}`, "index"]);
  const headings = useMemo(() => vault().parsed(path)?.headings ?? [], [path, v]);
  const cursorLine = useStore(ui, (s) => s.cursorLine);
  const mode = useStore(ui, (s) => s.mode);
  const min = headings.reduce((m, h) => Math.min(m, h.level), 6);
  let current = -1;
  if (mode !== "reading") headings.forEach((h, i) => { if (h.line <= cursorLine) current = i; });
  return (
    <section aria-labelledby="ol-h" className="rp-section">
      <div id="ol-h"><SectionHeader n="02" label="Outline" as="h2" /></div>
      {headings.length === 0 ? <p className="muted small">Headings in this note appear here.</p> : (
        <ul className="outline-list">
          {headings.map((h, i) => (
            <li key={`${h.line}-${i}`}>
              <button type="button" className={`outline-row ${i === current ? "current" : ""}`} style={{ paddingLeft: 8 + (h.level - min) * 12 }} aria-current={i === current ? "location" : undefined} onClick={() => gotoHeading(path, h)}>
                <span className="mono muted outline-level" aria-hidden="true">H{h.level}</span>
                <span className="outline-text">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ properties */

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function Calendar({ value, onPick, onClose }: { value: string; onPick: (iso: string) => void; onClose: () => void }) {
  const init = DATE_RE.test(value) ? new Date(value.slice(0, 10) + "T00:00:00") : new Date();
  const [cursor, setCursor] = useState(new Date(init.getFullYear(), init.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-day].sel, [data-day]")?.focus();
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose]);
  const first = cursor.getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const sel = DATE_RE.test(value) ? value.slice(0, 10) : "";
  return (
    <div ref={ref} className="popover calendar" role="dialog" aria-label="Choose a date" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="cal-head">
        <button type="button" className="icon-btn sm" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} strokeWidth={1.5} /></button>
        <span className="cal-title" aria-live="polite">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</span>
        <button type="button" className="icon-btn sm" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronR size={16} strokeWidth={1.5} /></button>
      </div>
      <div className="cal-grid" role="grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="cal-dow" aria-hidden="true">{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={i} /> : (
          <button key={i} type="button" data-day className={`cal-day ${isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), d)) === sel ? "sel" : ""}`} onClick={() => onPick(isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), d)))}>{d}</button>
        ))}
      </div>
      <div className="cal-foot"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick(isoDate(new Date()))}>Today</button></div>
    </div>
  );
}

function ListEditor({ name, items, onChange }: { name: string; items: unknown[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const strs = items.map(String);
  const add = () => {
    const v = draft.trim().replace(/^#/, "");
    if (v && !strs.includes(v)) onChange([...strs, v]);
    setDraft("");
  };
  return (
    <div className="chips">
      {strs.map((s, i) => <Chip key={s + i} label={s} onRemove={() => onChange(strs.filter((_, j) => j !== i))}>{s}</Chip>)}
      <input
        className="chip-input"
        value={draft}
        placeholder={strs.length ? "" : "Add"}
        aria-label={`Add to ${name}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          else if (e.key === "Backspace" && !draft && strs.length) onChange(strs.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

function ValueEditor({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [cal, setCal] = useState(false);
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  if (typeof value === "boolean") return <Switch checked={value} label={name} onChange={onChange} />;
  if (Array.isArray(value)) return <ListEditor name={name} items={value} onChange={onChange} />;
  if (value !== null && typeof value === "object") return <span className="muted small mono" title="Edit this property in Source mode">{JSON.stringify(value)}</span>;
  if (typeof value === "string" && (DATE_RE.test(value) || /date|created|updated|due/i.test(name) && value === "")) {
    return (
      <span className="date-wrap">
        <button type="button" className="prop-input date-btn" onClick={() => setCal(true)} aria-haspopup="dialog" aria-label={`${name}: ${value || "choose a date"}`}>{value || "Choose a date"}</button>
        {cal ? <Calendar value={value} onClose={() => setCal(false)} onPick={(iso) => { setCal(false); onChange(iso); }} /> : null}
      </span>
    );
  }
  const isNum = typeof value === "number";
  const commit = () => {
    if (isNum) { const n = Number(text); if (text.trim() !== "" && Number.isFinite(n)) { if (n !== value) onChange(n); } else setText(String(value)); }
    else if (text !== (value ?? "")) onChange(text);
  };
  return (
    <input
      className="prop-input"
      type={isNum ? "number" : "text"}
      value={text}
      aria-label={name}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setText(value == null ? "" : String(value)); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

type NewType = "text" | "list" | "date" | "checkbox" | "number";

function Properties({ path }: { path: string }) {
  const v = useVaultVersion([`note:${path}`, "index"]);
  const fm = useMemo(() => vault().parsed(path)?.frontmatter ?? {}, [path, v]);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [type, setType] = useState<NewType>("text");

  const commit = async (k: string, value: unknown) => {
    try {
      const h = getEditor(path);
      const cur = h ? h.getDoc() : ((await vault().read(path)) ?? "");
      const next = setFrontmatterProperty(cur, k, value);
      if (h) h.applyContent(next); else await vault().write(path, next);
    } catch (e) { notify(`Could not update property: ${errorMessage(e)}`, "error"); }
  };
  const add = () => {
    const k = key.trim();
    if (!k || /[:\n]/.test(k)) { notify("Property names cannot be empty or contain a colon", "error"); return; }
    if (k in fm) { notify(`"${k}" already exists`, "error"); return; }
    const initial: unknown = type === "list" ? [] : type === "checkbox" ? false : type === "number" ? 0 : type === "date" ? isoDate(new Date()) : "";
    void commit(k, initial);
    setKey(""); setType("text"); setAdding(false);
  };
  const entries = Object.entries(fm);
  return (
    <section aria-labelledby="pr-h" className="rp-section">
      <div id="pr-h"><SectionHeader n="03" label="Properties" as="h2" /></div>
      {entries.length === 0 && !adding ? <p className="muted small">No properties yet. Add tags, aliases or any key.</p> : null}
      <div className="props">
        {entries.map(([k, val]) => (
          <div key={k} className="prop-row">
            <span className="prop-key mono" title={k}>{k}</span>
            <div className="prop-value"><ValueEditor name={k} value={val} onChange={(nv) => void commit(k, nv)} /></div>
            <button type="button" className="prop-del icon-btn sm" aria-label={`Remove property ${k}`} onClick={() => void commit(k, undefined)}><X size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
        {adding ? (
          <form className="prop-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input className="prop-input mono" value={key} onChange={(e) => { setKey(e.target.value); if (/^(tags?|aliases)$/i.test(e.target.value)) setType("list"); }} placeholder="name" aria-label="New property name" autoFocus onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }} />
            <select className="select sm" value={type} onChange={(e) => setType(e.target.value as NewType)} aria-label="Property type">
              <option value="text">Text</option><option value="list">List</option><option value="date">Date</option><option value="checkbox">Checkbox</option><option value="number">Number</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Add</button>
          </form>
        ) : <button type="button" className="btn btn-ghost btn-sm add-prop" onClick={() => setAdding(true)}><Plus size={14} strokeWidth={1.5} /> Add property</button>}
      </div>
    </section>
  );
}

export function RightPanel() {
  const active = useStore(ui, (s) => s.active);
  if (!active || !active.toLowerCase().endsWith(".md")) return <div className="right-panel"><p className="muted small pad">Open a note to see its backlinks, outline and properties.</p></div>;
  return (
    <div className="right-panel">
      <Backlinks path={active} />
      <Outline path={active} />
      <Properties key={active} path={active} />
    </div>
  );
}
