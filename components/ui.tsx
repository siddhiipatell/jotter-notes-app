"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

export const IS_MAC = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
    const initial = el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el;
    initial.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = items();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", onKey);
    return () => { el.removeEventListener("keydown", onKey); if (prev && document.contains(prev)) prev.focus({ preventScroll: true }); };
  }, [ref, active]);
}

export function Modal({ onClose, label, children, className = "", align = "center", dismissable = true }: {
  onClose: () => void; label: string; children: ReactNode; className?: string; align?: "center" | "top"; dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div className={`modal-backdrop align-${align}`} onMouseDown={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`modal ${className}`}
        onKeyDown={(e) => { if (e.key === "Escape" && dismissable) { e.stopPropagation(); onClose(); } }}
      >
        {children}
      </div>
    </div>
  );
}

export function Button({ variant = "ghost", size = "md", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; size?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  return <button type="button" {...p} className={`btn btn-${variant} btn-${size} ${className}`} />;
}

export function Tip({ label, kbd, children, side = "bottom", end }: { label: string; kbd?: string; children: ReactNode; side?: "bottom" | "top" | "right"; end?: boolean }) {
  return (
    <span className="tip-wrap">
      {children}
      <span className={`tooltip tooltip-${side} ${end ? "tooltip-end" : ""}`} aria-hidden="true">
        {label}
        {kbd ? <kbd className="mono">{kbd}</kbd> : null}
      </span>
    </span>
  );
}

export function IconButton({ label, kbd, active, children, className = "", tipSide, tipEnd, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; kbd?: string; active?: boolean; tipSide?: "bottom" | "top" | "right"; tipEnd?: boolean }) {
  return (
    <Tip label={label} kbd={kbd} side={tipSide} end={tipEnd}>
      <button type="button" aria-label={label} aria-pressed={active} {...p} className={`icon-btn ${active ? "is-active" : ""} ${className}`}>
        {children}
      </button>
    </Tip>
  );
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }

export function KbdKeys({ keys }: { keys: string[] }) {
  return <span className="kbd-keys">{keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</span>;
}

export function StatusDot({ kind, size = 8 }: { kind: "synced" | "pending" | "conflict" | "offline"; size?: number }) {
  return <span className={`dot dot-${kind}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function SectionHeader({ n, label, as: Tag = "h2" }: { n: string; label: string; as?: "h2" | "h3" | "div" }) {
  return (
    <Tag className="section-header">
      <span className="section-dot" aria-hidden="true" />
      <span className="mono">{n}</span>
      <span className="mono" aria-hidden="true">/</span>
      <span className="mono">{label}</span>
    </Tag>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; kbd?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <Tip key={o.value} label={o.label} kbd={o.kbd}>
          <button type="button" className={value === o.value ? "on" : ""} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
        </Tip>
      ))}
    </div>
  );
}

export function Spinner() { return <span className="spinner" role="presentation" aria-hidden="true" />; }

export function Chip({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label?: string }) {
  return (
    <span className="chip">
      {children}
      {onRemove ? <button type="button" className="chip-x" aria-label={`Remove ${label ?? "item"}`} onClick={onRemove}><X size={12} strokeWidth={1.75} /></button> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ context menu */

export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; destructive?: boolean; disabled?: boolean; separator?: boolean }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const scroll = () => onClose();
    document.addEventListener("mousedown", down, true);
    window.addEventListener("blur", scroll);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", scroll);
      window.removeEventListener("resize", scroll);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [onClose]);
  const onKey = (e: React.KeyboardEvent) => {
    const btns = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); btns[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); btns[btns.length - 1]?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); onClose(); }
  };
  return (
    <div ref={ref} role="menu" className="menu" style={{ left: pos.x, top: pos.y }} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.separator ? <div key={i} role="separator" className="menu-sep" /> : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} className={`menu-item ${it.destructive ? "destructive" : ""}`} onClick={() => { onClose(); it.onSelect(); }}>
            <span className="menu-icon" aria-hidden="true">{it.icon}</span>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

export const GithubMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

export const JotterMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-blue)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 8v8a4 4 0 0 1-4 4H8" />
    <circle cx="15" cy="4" r="0.75" fill="var(--color-ink-blue)" />
  </svg>
);

export function Wordmark() {
  return <span className="wordmark"><JotterMark /><span>Jotter</span></span>;
}
