"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CaseSensitive, Regex, Search, X } from "lucide-react";
import { Tip } from "./ui";
import { vault, useVaultVersion } from "@/lib/ui/vault";
import { chipsToString, extractChips, matchesChips, parseOperators, type OperatorChip } from "@/lib/ui/fuzzy";
import { compileQuery, scanContent } from "@/lib/ui/textsearch";
import { noteTitle } from "@/lib/ui/wikilink";
import { openNote } from "@/lib/ui/actions";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";

interface Result { path: string; title: string; snippet: string; line?: number }

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{text.split(re).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}</>;
}

export function SearchPanel() {
  const seed = useStore(ui, (s) => s.searchSeed);
  const nonce = useStore(ui, (s) => s.searchSeedNonce);
  const [text, setText] = useState("");
  const [chips, setChips] = useState<OperatorChip[]>([]);
  const [matchCase, setMatchCase] = useState(false);
  const [regex, setRegex] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const version = useVaultVersion(["index", "tree"]);

  useEffect(() => {
    const { chips: c, rest } = extractChips(seed + (seed && !/\s$/.test(seed) ? " " : ""));
    if (nonce > 0) { setChips(c); setText(rest); }
    input.current?.focus();
  }, [seed, nonce]);

  const live = useMemo(() => parseOperators(`${chipsToString(chips)} ${text}`), [chips, text]);

  useEffect(() => {
    let cancelled = false;
    const q = live.text;
    const run = async () => {
      const v = vault();
      const tagsOf = (p: string) => v.parsed(p)?.tags ?? [];
      if (!q && !live.chips.length) { setResults([]); setBusy(false); return; }
      if (!matchCase && !regex) {
        let hits: Result[];
        if (q) hits = v.search(q, 80).map((h) => ({ path: h.path, title: h.title, snippet: h.snippet, line: h.line }));
        else hits = v.listPaths().filter((p) => p.endsWith(".md")).map((p) => ({ path: p, title: noteTitle(p), snippet: "" }));
        const out = hits.filter((h) => matchesChips(live.chips, h.path, tagsOf(h.path))).slice(0, 100);
        if (!cancelled) { setResults(out); setSel(0); setBusy(false); }
        return;
      }
      const re = compileQuery(q, { regex, caseSensitive: matchCase });
      if (!re) { setResults([]); setBusy(false); return; }
      setBusy(true);
      const paths = v.listPaths().filter((p) => p.endsWith(".md") && matchesChips(live.chips, p, tagsOf(p)));
      const out: Result[] = [];
      for (let i = 0; i < paths.length && out.length < 100; i += 25) {
        const batch = await Promise.all(paths.slice(i, i + 25).map(async (p) => [p, await v.read(p)] as const));
        if (cancelled) return;
        for (const [p, content] of batch) {
          const hit = content ? scanContent(content, re) : null;
          if (hit) out.push({ path: p, title: noteTitle(p), snippet: hit.snippet, line: hit.line + 1 });
        }
      }
      if (!cancelled) { setResults(out); setSel(0); setBusy(false); }
    };
    const t = setTimeout(() => void run().catch(() => setBusy(false)), 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [live, matchCase, regex, version]);

  const terms = useMemo(() => (regex ? [] : live.text.split(/\s+/).filter(Boolean)), [live.text, regex]);
  const onText = (value: string) => {
    const x = extractChips(value);
    if (x.chips.length) { setChips((c) => [...c, ...x.chips]); setText(x.rest); } else setText(value);
  };
  const open = (r: Result, newTab = false) => openNote(r.path, { line: r.line, newTab });
  const hasQuery = !!live.text || live.chips.length > 0;

  return (
    <div className="search-panel">
      <div className="search-bar">
        <div className="search-pill">
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          {chips.map((c, i) => (
            <span key={i} className="op-chip mono">
              {c.op}:{c.value}
              <button type="button" aria-label={`Remove ${c.op} filter ${c.value}`} onClick={() => setChips((cs) => cs.filter((_, j) => j !== i))}><X size={10} strokeWidth={2} /></button>
            </span>
          ))}
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={results[sel] ? `sr-${sel}` : undefined}
            aria-label="Search notes"
            placeholder={chips.length ? "" : "Search notes (tag:, path:)"}
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && results[sel]) { e.preventDefault(); open(results[sel], e.ctrlKey || e.metaKey); }
              else if (e.key === "Backspace" && !text && chips.length) setChips((c) => c.slice(0, -1));
            }}
          />
          <span className="search-toggles">
            <Tip label="Match case"><button type="button" className={`mini-toggle ${matchCase ? "on" : ""}`} aria-pressed={matchCase} aria-label="Match case" onClick={() => setMatchCase((v) => !v)}><CaseSensitive size={14} strokeWidth={1.75} /></button></Tip>
            <Tip label="Use regular expression"><button type="button" className={`mini-toggle ${regex ? "on" : ""}`} aria-pressed={regex} aria-label="Use regular expression" onClick={() => setRegex((v) => !v)}><Regex size={14} strokeWidth={1.75} /></button></Tip>
          </span>
        </div>
      </div>
      <p className="search-count mono" aria-live="polite">{busy ? "Searching…" : hasQuery ? `${results.length}${results.length >= 100 ? "+" : ""} result${results.length === 1 ? "" : "s"}` : ""}</p>
      <div className="search-results" id="search-results" role="listbox" aria-label="Search results">
        {results.map((r, i) => (
          <button key={r.path} id={`sr-${i}`} type="button" role="option" aria-selected={i === sel} className={`search-result ${i === sel ? "selected" : ""}`} onClick={(e) => open(r, e.ctrlKey || e.metaKey)} onMouseMove={() => setSel(i)}>
            <span className="sr-title">{r.title}</span>
            <span className="sr-path mono">{r.path}</span>
            {r.snippet ? <span className="sr-snippet"><Highlighted text={r.snippet} terms={terms} /></span> : null}
          </button>
        ))}
        {hasQuery && !busy && results.length === 0 ? <p className="muted pad">No notes match.</p> : null}
        {!hasQuery ? <p className="muted pad small">Search note text and titles. Use <span className="mono">tag:</span> and <span className="mono">path:</span> to narrow results.</p> : null}
      </div>
    </div>
  );
}
