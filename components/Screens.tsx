"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { HardDrive, Lock, FileText, Search, LockKeyhole, ArrowRight, Link as LinkIcon } from "lucide-react";
import { Landing } from "./Landing";
import { Button, GithubMark, Spinner, Wordmark } from "./ui";
import { chooseRepo, logout, unlockVault, switchRepo } from "@/lib/ui/actions";
import { loginUrl, listRepos } from "@/lib/ui/api";
import { errorMessage } from "@/lib/ui/toast";
import { useStore } from "@/lib/ui/store";
import { ui } from "@/lib/ui/state";
import type { RepoSummary } from "@/lib/types";

const AUTH_ERRORS: Record<string, string> = {
  denied: "GitHub sign-in was cancelled.",
  state: "The sign-in request expired. Please try again.",
  exchange: "GitHub did not accept the sign-in. Check the OAuth app settings and try again.",
  config: "The server is missing configuration (SESSION_SECRET).",
};

export function SignIn() {
  const initialError = useStore(ui, (s) => s.error);
  const [qError, setQError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const a = q.get("auth_error");
    const e = a ? (AUTH_ERRORS[a] ?? a) : q.get("error");
    if (e) setQError(e);
  }, []);
  const error = qError ?? initialError;
  return <Landing error={error} />;
}

export function RepoPicker() {
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const user = useStore(ui, (s) => s.session?.user ?? null);
  useEffect(() => { listRepos().then(setRepos).catch((e) => setError(errorMessage(e))); }, []);
  const shown = useMemo(() => (repos ?? []).filter((r) => `${r.owner}/${r.name}`.toLowerCase().includes(filter.toLowerCase())), [repos, filter]);
  const pick = async (r: RepoSummary) => {
    setBusy(`${r.owner}/${r.name}`);
    setError(null);
    try { await chooseRepo({ owner: r.owner, name: r.name, branch: r.branch }); } catch (e) { setError(errorMessage(e)); setBusy(null); }
  };
  return (
    <main className="page dot-grid">
      <div className="page-stack">
        <section className="card picker" aria-labelledby="picker-title">
          <Wordmark />
          <h1 id="picker-title" className="heading-lg">Choose the repository for your notes</h1>
          <p className="subhead-sm">{user ? `Signed in as ${user.name ?? user.login}. ` : ""}Notes are stored as Markdown files in the repository you pick. A private, empty repository works well.</p>
          <div className="search-pill">
            <Search size={16} strokeWidth={1.5} aria-hidden="true" />
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories" aria-label="Filter repositories" data-autofocus autoFocus />
          </div>
          {error ? <p role="alert" className="form-error"><span className="dot dot-conflict" aria-hidden="true" />{error}</p> : null}
          <div className="repo-list" role="list" aria-busy={!repos && !error}>
            {!repos && !error ? <div className="repo-loading"><Spinner /> Loading repositories</div> : null}
            {repos && shown.length === 0 ? <p className="muted pad">No repositories match.</p> : null}
            {shown.map((r) => {
              const key = `${r.owner}/${r.name}`;
              return (
                <button key={key} type="button" role="listitem" className="repo-row" disabled={!!busy} onClick={() => pick(r)}>
                  <span className="mono repo-name">{key}</span>
                  <span className="repo-meta">
                    {r.private ? <span className="repo-private"><LockKeyhole size={12} strokeWidth={1.5} aria-hidden="true" /> Private</span> : <span>Public</span>}
                    <span className="mono">{r.branch}</span>
                  </span>
                  {busy === key ? <Spinner /> : <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <Button size="sm" onClick={() => void logout()}>Sign out</Button>
        </section>
      </div>
    </main>
  );
}

export function UnlockCard() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const repo = useStore(ui, (s) => s.session?.repo);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setWrong(null);
    try {
      await unlockVault(pass);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setWrong(name === "WrongPassphraseError" ? "That passphrase is not right. Try again." : errorMessage(err));
      setBusy(false);
      input.current?.select();
    }
  };
  return (
    <main className="page dot-grid center">
      <form className="unlock-card" onSubmit={submit} aria-labelledby="unlock-title">
        <span className="unlock-icon"><Lock size={24} strokeWidth={1.5} color="var(--color-ink-blue)" aria-hidden="true" /></span>
        <h1 id="unlock-title" className="unlock-title">Unlock your notes</h1>
        {repo ? <p className="mono muted small">{repo.owner}/{repo.name}</p> : null}
        <div className="search-pill pill-field">
          <input ref={input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase" aria-label="Passphrase" aria-describedby="unlock-note unlock-error" autoComplete="current-password" data-autofocus autoFocus style={{ paddingLeft: 16 }} />
        </div>
        <p id="unlock-error" role="alert" className="form-error left">{wrong ? <><span className="dot dot-conflict" aria-hidden="true" />{wrong}</> : null}</p>
        <Button type="submit" variant="primary" size="lg" className="halo full" disabled={!pass || busy}>{busy ? <><Spinner /> Unlocking</> : "Unlock"}</Button>
        <p id="unlock-note" className="muted note-13">Your passphrase never leaves this device. If you lose it, your notes cannot be recovered.</p>
        <div className="unlock-links">
          <Button size="sm" type="button" onClick={() => void switchRepo()}>Switch repository</Button>
          <Button size="sm" type="button" onClick={() => void logout()}>Sign out</Button>
        </div>
      </form>
    </main>
  );
}

export function Opening() {
  return (
    <main className="page dot-grid center" aria-busy="true">
      <div className="card narrow center-text" role="status">
        <Wordmark />
        <p className="muted"><Spinner /> Opening your notes</p>
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return <main className="page dot-grid center" aria-busy="true"><div className="card narrow center-text" role="status"><Wordmark /><p className="muted"><Spinner /> Loading</p></div></main>;
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="page dot-grid center">
      <div className="card narrow center-text" role="alert">
        <Wordmark />
        <h1 className="unlock-title">Could not open your notes</h1>
        <p className="form-error"><span className="dot dot-conflict" aria-hidden="true" />{message}</p>
        <div className="unlock-links">
          <Button variant="primary" onClick={onRetry}>Try again</Button>
          <Button onClick={() => void switchRepo()}>Switch repository</Button>
          <Button onClick={() => void logout()}>Sign out</Button>
        </div>
      </div>
    </main>
  );
}
