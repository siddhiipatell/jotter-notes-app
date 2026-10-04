"use client";
import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button, IconButton, Modal, SectionHeader, Spinner, Switch } from "./ui";
import { useSettings, updateSettings, NOTE_FONTS, type NoteFont, type ThemeChoice } from "@/lib/ui/settings";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { lockVault, logout, pullNow, pushNow, setMode, setModal, switchRepo } from "@/lib/ui/actions";
import { confirmDialog } from "@/lib/ui/confirm";
import { notify, errorMessage } from "@/lib/ui/toast";
import { vault } from "@/lib/ui/vault";
import { useSyncState } from "@/lib/ui/sync";
import type { ViewMode } from "@/lib/ui/commands";

function Row({ label, desc, children, id }: { label: string; desc?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label" id={id}>{label}</div>
        {desc ? <div className="setting-desc">{desc}</div> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Group({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <section className="group-card" aria-label={label}>
      <SectionHeader n={n} label={label.toUpperCase()} as="h3" />
      {children}
    </section>
  );
}

function EnableEncryption({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = pass.length > 0 && pass.length < 8 ? "Use at least 8 characters." : again && pass !== again ? "The two passphrases do not match." : null;
  const ready = pass.length >= 8 && pass === again && understood && !busy;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await vault().enableEncryption(pass);
      ui.set({ encrypted: true });
      notify("Encryption is on. Your notes are re-encrypted with the next push.");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <form className="enc-form" onSubmit={submit}>
      <label className="field"><span>Passphrase</span>
        <input type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" data-autofocus aria-describedby="enc-warn enc-err" />
      </label>
      <label className="field"><span>Confirm passphrase</span>
        <input type="password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </label>
      <p id="enc-err" role="alert" className="form-error left">{problem || error ? <><span className="dot dot-conflict" aria-hidden="true" />{problem ?? error}</> : null}</p>
      <p id="enc-warn" className="enc-warning"><strong>If you lose this passphrase, your notes cannot be recovered.</strong> It never leaves this device, and nobody can reset it for you.</p>
      <label className="check"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> I understand that a lost passphrase means lost notes.</label>
      <div className="modal-actions">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!ready}>{busy ? <><Spinner /> Encrypting</> : "Turn on encryption"}</Button>
      </div>
    </form>
  );
}

export function SettingsModal() {
  const s = useSettings();
  const encrypted = useStore(ui, (st) => st.encrypted);
  const repo = useStore(ui, (st) => st.session?.repo);
  const sync = useSyncState();
  const [enabling, setEnabling] = useState(false);
  const [busy, setBusy] = useState(false);

  const disable = async () => {
    const ok = await confirmDialog({
      title: "Turn off encryption?",
      message: "Your notes will be pushed to GitHub as plain Markdown on the next push, readable by anyone with access to the repository. Older commits stay encrypted.",
      confirmLabel: "Turn off encryption",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await vault().disableEncryption(); ui.set({ encrypted: false }); notify("Encryption is off."); } catch (e) { notify(errorMessage(e), "error"); }
    setBusy(false);
  };

  const syncLabel = sync.kind === "unsynced" ? `${sync.count} unsynced` : sync.kind === "conflict" ? `${sync.count} in conflict` : sync.kind === "error" ? `Error: ${sync.message}` : sync.kind[0].toUpperCase() + sync.kind.slice(1);

  return (
    <Modal onClose={() => setModal(null)} label="Settings" className="settings-modal">
      <div className="modal-head">
        <h2 className="modal-title">Settings</h2>
        <IconButton label="Close settings" onClick={() => setModal(null)}><X size={20} strokeWidth={1.5} /></IconButton>
      </div>
      <div className="settings-body">
        <Group n="01" label="Editor">
          <Row label="Default editing mode" desc="How notes open. You can switch any time from the tab bar.">
            <select className="select" aria-label="Default editing mode" value={s.defaultMode} onChange={(e) => { const m = e.target.value as ViewMode; updateSettings({ defaultMode: m }); setMode(m); }}>
              <option value="live">Live Preview</option><option value="source">Source</option><option value="reading">Reading</option>
            </select>
          </Row>
          <Row label="Readable line length" desc="Limit note text to a comfortable 720px column."><Switch label="Readable line length" checked={s.readableWidth} onChange={(v) => updateSettings({ readableWidth: v })} /></Row>
          <Row label="Spell check" desc="Use your browser's spell checker while typing."><Switch label="Spell check" checked={s.spellcheck} onChange={(v) => updateSettings({ spellcheck: v })} /></Row>
        </Group>

        <Group n="02" label="Appearance">
          <Row label="Theme" desc="Follow your system, or choose light or dark.">
            <select className="select" aria-label="Theme" value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as ThemeChoice })}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </Row>
          <Row label="Note font size" desc="Applies to the text inside notes.">
            <div className="stepper">
              <IconButton label="Smaller text" disabled={s.fontSize <= 12} onClick={() => updateSettings({ fontSize: s.fontSize - 1 })}><Minus size={16} strokeWidth={1.5} /></IconButton>
              <span className="mono stepper-value" aria-live="polite">{s.fontSize}px</span>
              <IconButton label="Larger text" disabled={s.fontSize >= 24} onClick={() => updateSettings({ fontSize: s.fontSize + 1 })}><Plus size={16} strokeWidth={1.5} /></IconButton>
            </div>
          </Row>
          <Row label="Note font" desc="The interface always uses Inter.">
            <select className="select" aria-label="Note font" value={s.noteFont} onChange={(e) => updateSettings({ noteFont: e.target.value as NoteFont })}>
              {(Object.keys(NOTE_FONTS) as NoteFont[]).map((k) => <option key={k} value={k}>{NOTE_FONTS[k].label}</option>)}
            </select>
          </Row>
        </Group>

        <Group n="03" label="Sync">
          <Row label="Status" desc={repo ? `${repo.owner}/${repo.name} on ${repo.branch}` : undefined}><span className="mono" role="status">{syncLabel}</span></Row>
          <Row label="Push and pull" desc="Changes are pushed automatically after a pause. Use these to sync right now.">
            <div className="btn-row"><Button variant="primary" size="sm" onClick={() => void pushNow()}>Push now</Button><Button size="sm" variant="outline" onClick={() => void pullNow()}>Pull now</Button></div>
          </Row>
          <Row label="Repository" desc="Choose a different repository for your notes.">
            <Button size="sm" variant="outline" onClick={() => { setModal(null); void switchRepo(); }}>Switch repository</Button>
          </Row>
        </Group>

        <Group n="04" label="Security">
          <Row label="Encrypt notes" desc="Encrypt every note in your browser with a passphrase before it is pushed to GitHub. Turn it off to keep plain Markdown that other editors can open.">
            {busy ? <Spinner /> : <Switch label="Encrypt notes" checked={encrypted || enabling} onChange={(v) => { if (v) setEnabling(true); else if (enabling) setEnabling(false); else void disable(); }} />}
          </Row>
          {enabling && !encrypted ? <EnableEncryption onDone={() => setEnabling(false)} onCancel={() => setEnabling(false)} /> : null}
          {encrypted ? <Row label="Lock vault" desc="Forget the passphrase on this device until you enter it again."><Button size="sm" variant="outline" onClick={() => { setModal(null); void lockVault(); }}>Lock now</Button></Row> : null}
          <Row label="Sign out" desc="Remove your GitHub session from this browser."><Button size="sm" variant="outline" onClick={() => { setModal(null); void logout(); }}>Sign out</Button></Row>
        </Group>
      </div>
    </Modal>
  );
}
