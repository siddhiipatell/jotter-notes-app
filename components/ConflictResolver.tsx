"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, IconButton, Modal, Spinner } from "./ui";
import { useConflicts } from "@/lib/ui/sync";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { setModal } from "@/lib/ui/actions";
import { vault } from "@/lib/ui/vault";
import { alignRows, hasConflictMarkers, mergedDraft, type DiffCell } from "@/lib/ui/diffrows";
import { confirmDialog } from "@/lib/ui/confirm";
import { notify, errorMessage } from "@/lib/ui/toast";
import { noteTitle } from "@/lib/ui/wikilink";

function Panel({ side, cells, scrollRef, onScroll }: { side: "Mine" | "Theirs"; cells: (DiffCell | null)[]; scrollRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void }) {
  return (
    <section className="diff-panel" aria-label={`${side} version`}>
      <div className="diff-head"><span className="pill-label">{side}</span></div>
      <div className="diff-body mono" ref={scrollRef} onScroll={onScroll} tabIndex={0} role="region" aria-label={`${side} text`}>
        {cells.map((c, i) => (
          <div key={i} className={`diff-line ${c ? c.kind : "filler"}`}>
            <span className="diff-num" aria-hidden="true">{c?.n ?? ""}</span>
            <span className="diff-mark" aria-hidden="true">{c?.kind === "del" ? "−" : c?.kind === "add" ? "+" : ""}</span>
            <span className="diff-text">{c ? (c.text || " ") : " "}</span>
            {c && c.kind !== "same" ? <span className="sr-only">{c.kind === "del" ? "only in mine" : "only in theirs"}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ConflictResolver() {
  const conflicts = useConflicts();
  const wanted = useStore(ui, (s) => s.conflictPath);
  const [path, setPath] = useState<string | null>(wanted);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const current = conflicts.find((c) => c.path === path) ?? conflicts[0];
  useEffect(() => { if (conflicts.length === 0) setModal(null); }, [conflicts.length]);
  useEffect(() => { setEditing(false); }, [current?.path]);
  const rows = useMemo(() => (current ? alignRows(current.mine, current.theirs) : []), [current]);

  if (!current) return null;
  const title = noteTitle(current.path);

  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  const resolve = async (resolution: "mine" | "theirs" | string) => {
    setBusy(true);
    try {
      await vault().resolveConflict(current.path, resolution);
      notify(`Resolved ${title}.`);
    } catch (e) {
      notify(`Could not resolve: ${errorMessage(e)}`, "error");
    }
    setBusy(false);
  };

  const keep = async (which: "mine" | "theirs") => {
    const ok = await confirmDialog({
      title: which === "mine" ? "Keep your version?" : "Keep the GitHub version?",
      message: which === "mine"
        ? `The version of “${title}” from GitHub will be discarded and replaced by yours.`
        : `Your edits to “${title}” will be discarded and replaced by the version from GitHub.`,
      confirmLabel: which === "mine" ? "Keep mine" : "Keep theirs",
      destructive: true,
    });
    if (ok) await resolve(which);
  };

  const saveMerged = async () => {
    const markers = hasConflictMarkers(draft);
    const ok = await confirmDialog({
      title: "Save merged result?",
      message: markers ? "The text still contains conflict markers (<<<<<<<, =======, >>>>>>>). Both original versions will be replaced by this text, markers included." : `Both versions of “${title}” will be replaced by this merged text.`,
      confirmLabel: "Save merged result",
      destructive: markers,
    });
    if (ok) await resolve(draft);
  };

  return (
    <Modal onClose={() => setModal(null)} label="Resolve conflict" className="conflict-modal">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">Two versions of “{title}”</h2>
          <p className="muted small">This note changed here and on GitHub. Nothing is discarded until you choose.</p>
        </div>
        <IconButton label="Close" onClick={() => setModal(null)}><X size={20} strokeWidth={1.5} /></IconButton>
      </div>
      {conflicts.length > 1 ? (
        <div className="conflict-tabs" role="tablist" aria-label="Notes in conflict">
          {conflicts.map((c) => (
            <button key={c.path} type="button" role="tab" aria-selected={c.path === current.path} className={`conflict-tab ${c.path === current.path ? "on" : ""}`} onClick={() => setPath(c.path)}><span className="mono">{c.path}</span></button>
          ))}
        </div>
      ) : <p className="mono muted small conflict-path">{current.path}</p>}

      {editing ? (
        <div className="merge-edit">
          <label htmlFor="merged-text" className="small muted">Edit the merged text. Lines between the markers show where the versions differ.</label>
          <textarea id="merged-text" className="merge-text mono" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} data-autofocus />
        </div>
      ) : (
        <div className="diff-grid">
          <Panel side="Mine" cells={rows.map((r) => r.left)} scrollRef={left} onScroll={() => mirror(left.current, right.current)} />
          <Panel side="Theirs" cells={rows.map((r) => r.right)} scrollRef={right} onScroll={() => mirror(right.current, left.current)} />
        </div>
      )}

      <div className="modal-actions conflict-actions">
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} disabled={busy}>Back to comparison</Button>
            <Button variant="primary" onClick={() => void saveMerged()} disabled={busy}>{busy ? <Spinner /> : null} Save merged result</Button>
          </>
        ) : (
          <>
            <Button onClick={() => void keep("mine")} disabled={busy}>Keep mine</Button>
            <Button onClick={() => void keep("theirs")} disabled={busy}>Keep theirs</Button>
            <Button variant="primary" onClick={() => { setDraft(mergedDraft(current.mine, current.theirs)); setEditing(true); }} disabled={busy}>Edit merged result</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
