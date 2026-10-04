"use client";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ArrowRight, Folder, FileText, GitCommit, Link as LinkIcon, Lock, Search, HardDrive, ChevronRight, ShieldCheck } from "lucide-react";
import { AsciiField } from "./AsciiField";
import { GithubMark, Wordmark } from "./ui";
import { loginUrl } from "@/lib/ui/api";
import "./landing.css";

/** Fades a block up the first time it scrolls into view. */
function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }: { as?: ElementType; delay?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>;
}

const TITLE = "Reading list";
const PAUSE = [700, 900, 700, 900, 1400, 2800]; // before: link, tag, unsynced, syncing, synced, restart

/** Drives the looping demo: typing, link, tag, then sync status. */
function useDemo() {
  const [typed, setTyped] = useState(TITLE.length);
  const [stage, setStage] = useState(5);
  useEffect(() => {
    let off = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(() => { if (!off) fn(); }, ms)); };
    const run = () => {
      setTyped(0); setStage(0);
      let t = 500;
      for (let i = 1; i <= TITLE.length; i++) { later(() => setTyped(i), t); t += 70; }
      for (let s = 1; s <= 5; s++) { t += PAUSE[s - 1]; later(() => setStage(s), t); }
      later(run, t + PAUSE[5]);
    };
    run();
    return () => { off = true; timers.forEach(clearTimeout); };
  }, []);
  return { typed, stage };
}

function AppMock() {
  const { typed, stage } = useDemo();
  const status = stage >= 5 ? "synced" : stage === 4 ? "syncing" : stage === 3 ? "unsynced" : "idle";
  const dirty = status === "unsynced" || status === "idle";
  return (
    <div className="am-wrap">
      <div className="am" role="img" aria-label="Preview of the Jotter app: a note being typed with a wikilink and a tag, then synced to GitHub">
        <div className="am-side" aria-hidden="true">
          <div className="am-row"><Folder size={14} strokeWidth={1.5} />Daily</div>
          <div className="am-row"><Folder size={14} strokeWidth={1.5} />Projects</div>
          <div className="am-row"><FileText size={14} strokeWidth={1.5} />Ideas</div>
          <div className="am-row on"><FileText size={14} strokeWidth={1.5} />{TITLE.slice(0, Math.max(typed, 1))}{dirty ? <span className="dot dot-pending am-dot" /> : null}</div>
          <div className="am-row"><FileText size={14} strokeWidth={1.5} />Weekly review</div>
        </div>
        <div className="am-main" aria-hidden="true">
          <div className="am-tabs"><span className="am-tab">{TITLE.slice(0, Math.max(typed, 1))}</span><span className="am-modes"><b>Live</b><i>Source</i></span></div>
          <div className="am-body">
            <div className="am-h1">{TITLE.slice(0, typed)}{typed < TITLE.length ? <span className="am-caret" /> : null}</div>
            <p className={"am-line" + (stage >= 1 ? " on" : "")}>Next up: <span className="am-link">[[Ideas]]</span> <span className={"am-tag" + (stage >= 2 ? " on" : "")}>#books</span></p>
            <p className={"am-line" + (stage >= 1 ? " on" : "")}><span className="am-check" /> Finish chapter three</p>
          </div>
          <div className="am-status">
            {status === "syncing" ? <span className="am-spin" /> : <span className={"dot " + (status === "synced" ? "dot-synced" : status === "unsynced" ? "dot-pending" : "dot-ash")} />}
            <span>{status === "synced" ? "Synced" : status === "syncing" ? "Syncing" : status === "unsynced" ? "1 unsynced" : "Typing"}</span>
            <Lock size={12} strokeWidth={1.5} className="am-lock" />
            <span className="am-repo">you/notes</span>
          </div>
        </div>
      </div>
      <div className="float f-enc"><span className="f-ico"><ShieldCheck size={16} strokeWidth={1.5} /></span><span><b>Encrypted</b><small>AES-256, in your browser</small></span></div>
      <div className="float f-back">
        <p className="num-head"><span className="dot dot-ink" /> BACKLINKS <span className="f-count">2</span></p>
        <div className="f-bl"><b>Ideas</b><span>…add to <u>Reading list</u> next</span></div>
        <div className="float-bl-sep" />
        <div className="f-bl"><b>Weekly review</b><span>…see <u>Reading list</u> for books</span></div>
      </div>
      <div className={"float f-commit" + (status === "synced" ? " on" : "")}><span className="f-ico"><GitCommit size={16} strokeWidth={1.5} /></span><span><b>Update Reading list</b><small className="mono">3f9a1c2 · 1 commit</small></span></div>
    </div>
  );
}

const FACTS = [
  { big: "AES-256", label: "Encrypted in your browser before it leaves" },
  { big: "1 commit", label: "per batch of edits, under your name" },
  { big: "0 bytes", label: "of your notes stored on our servers" },
  { big: ".md", label: "plain Markdown files you own" },
];

export function Landing({ error }: { error: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <main className="landing">
      <header className={"land-nav-wrap" + (scrolled ? " scrolled" : "")}>
        <div className="land-nav">
          <Wordmark />
          <nav className="land-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="land-actions">
            <a className="land-login" href={loginUrl}>Log in</a>
            <a className="btn btn-primary" href={loginUrl}>Get started</a>
          </div>
        </div>
      </header>

      <section className="land-hero" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true" />
        <div className="land-copy">
          <p className="eyebrow"><span className="dot dot-ink" aria-hidden="true" />Local-first · Encrypted · Plain Markdown</p>
          <h1 id="hero-title" className="land-title">Your notes,<br /><span className="accent">in your own repo.</span></h1>
          <p className="land-sub">Write linked Markdown notes from any device. They are saved to GitHub as plain files, encrypted with a passphrase only you know.</p>
          {error ? <p role="alert" className="form-error"><span className="dot dot-conflict" aria-hidden="true" />Sign-in problem: {error}</p> : null}
          <div className="land-cta">
            <a className="btn btn-primary btn-xl halo-pulse" href={loginUrl}><GithubMark /> Continue with GitHub <ArrowRight size={16} strokeWidth={1.5} /></a>
            <a className="btn btn-outline btn-xl" href="#how">See how it works</a>
          </div>
        </div>
        <div className="land-visual"><AppMock /></div>
      </section>

      <div className="land-band"><AsciiField /></div>

      <Reveal as="section" className="facts" aria-label="At a glance">
        {FACTS.map((f) => (<div key={f.big} className="fact"><span className="fact-big">{f.big}</span><span className="fact-label">{f.label}</span></div>))}
      </Reveal>

      <section className="land-section" id="how" aria-labelledby="how-title">
        <Reveal><p className="num-head"><span className="dot dot-ink" aria-hidden="true" /> 01 / HOW IT WORKS</p></Reveal>
        <Reveal as="h2" id="how-title" className="heading-lg">Write here. <span className="accent">Keep it in GitHub.</span></Reveal>
        <div className="steps3">
          <Reveal className="step" delay={0}>
            <div className="step-vis">
              <div className="sv-edit"><span>Reading list</span><i className="am-caret" /></div>
              <div className="sv-chip mono"><HardDrive size={12} strokeWidth={1.5} /> saved in browser · 4 ms</div>
            </div>
            <h3><span className="step-n mono">01</span> Edit</h3>
            <p>Every change is saved in your browser first, so typing is instant and nothing is ever lost.</p>
          </Reveal>
          <Reveal className="step" delay={90}>
            <div className="step-vis">
              <div className="sv-commit"><GitCommit size={14} strokeWidth={1.5} /><b>Update 5 notes</b><span className="mono">3f9a1c2</span></div>
              <div className="sv-commit dim"><GitCommit size={14} strokeWidth={1.5} /><b>Update Ideas</b><span className="mono">b71e04d</span></div>
              <div className="sv-chip mono"><Lock size={12} strokeWidth={1.5} /> encrypted · 1 commit</div>
            </div>
            <h3><span className="step-n mono">02</span> Push</h3>
            <p>After a short pause, your changes are encrypted and go to GitHub as one commit under your name.</p>
          </Reveal>
          <Reveal className="step" delay={180}>
            <div className="step-vis">
              <div className="sv-diff"><span className="pill">Mine</span><code><s>- ship v1 friday</s></code><code><ins>+ ship v1 monday</ins></code></div>
              <div className="sv-diff"><span className="pill">Theirs</span><code><s>- ship v1 friday</s></code><code><ins>+ ship v1 next week</ins></code></div>
            </div>
            <h3><span className="step-n mono">03</span> Merge</h3>
            <p>Changes made elsewhere are pulled in. If both sides changed a note, you see both versions. Nothing is lost.</p>
          </Reveal>
        </div>
      </section>

      <section className="land-section" id="features" aria-labelledby="feat-title">
        <Reveal><p className="num-head"><span className="dot dot-ink" aria-hidden="true" /> 02 / FEATURES</p></Reveal>
        <Reveal as="h2" id="feat-title" className="heading-lg">Everything a linked-notes app needs.</Reveal>
        <div className="bento">
          <Reveal className="tile t-wide">
            <div className="tile-vis">
              <p className="tv-text">Reading list links to <span className="am-link">[[Ideas]]</span> and <span className="am-link">[[Weekly review]]</span>. <span className="am-tag on">#books</span></p>
              <div className="tv-bl"><LinkIcon size={14} strokeWidth={1.5} /><b>Ideas</b><span>2 backlinks</span></div>
            </div>
            <h3>Linked notes</h3>
            <p>[[Wikilinks]], backlinks, embeds, tags and a simple form for properties. Rename a note and every link follows.</p>
          </Reveal>
          <Reveal className="tile" delay={80}>
            <div className="tile-vis">
              <div className="tv-pal"><Search size={14} strokeWidth={1.5} /><span className="chipq mono">tag:books</span><kbd>Esc</kbd></div>
              <div className="tv-res on"><b>Reading list</b><span className="mono">Reading list.md</span></div>
              <div className="tv-res"><b>Ideas</b><span className="mono">Ideas.md</span></div>
            </div>
            <h3>Fast search</h3>
            <p>Find any note by text, title or tag. Press Ctrl/Cmd+O to jump straight to one.</p>
          </Reveal>
          <Reveal className="tile" delay={0}>
            <div className="tile-vis">
              <div className="tv-cipher mono"><span className="c-plain">Reading list</span><span className="c-enc">JOTTER-ENC1<br />k3Jx9aQm2vVt0…</span></div>
            </div>
            <h3>Encrypted</h3>
            <p>On GitHub your notes are unreadable without your passphrase. Turn it off any time for plain Markdown.</p>
          </Reveal>
          <Reveal className="tile t-full" delay={80}>
            <div className="tile-vis">
              <pre className="tv-code mono"><span className="k">---</span>{"\ntags: "}<span className="k">[books]</span>{"\n"}<span className="k">---</span>{"\n# Reading list\nNext up: [[Ideas]]"}</pre>
            </div>
            <h3>Plain Markdown</h3>
            <p>Your notes stay ordinary .md files in your repo. Any Markdown editor can open them, and we never reformat what you didn&apos;t change.</p>
          </Reveal>
        </div>
      </section>

      <section className="land-section" id="privacy" aria-labelledby="priv-title">
        <Reveal className="cta-card">
          <p className="num-head"><span className="dot dot-ink" aria-hidden="true" /> 03 / PRIVACY</p>
          <h2 id="priv-title" className="heading-lg">Keep your notes <span className="accent">yours.</span></h2>
          <p className="land-sub">Your passphrase never leaves your device and nothing is stored on our servers. If you lose the passphrase, your notes cannot be recovered.</p>
          <div className="land-cta">
            <a className="btn btn-primary btn-xl halo-pulse" href={loginUrl}><GithubMark /> Continue with GitHub <ArrowRight size={16} strokeWidth={1.5} /></a>
          </div>
        </Reveal>
      </section>

      <footer className="land-foot">
        <Wordmark />
        <nav aria-label="Footer"><a href="#how">How it works</a><a href="#features">Features</a><a href="#privacy">Privacy</a><a href={loginUrl}>Log in</a></nav>
        <span>Notes stay in your GitHub repo.</span>
      </footer>
    </main>
  );
}
