"use client";
import { createStore } from "./store";
import type { ViewMode } from "./commands";
import type { SessionInfo } from "@/lib/types";

export type Phase = "loading" | "signin" | "repo" | "opening" | "unlock" | "ready" | "error";
export type Breakpoint = "wide" | "mid" | "narrow";
export type ModalKind = null | "palette" | "switcher" | "settings" | "conflicts";
export type Sheet = null | "files" | "search" | "right";

export interface UIState {
  phase: Phase;
  error: string | null;
  session: SessionInfo | null;
  encrypted: boolean;
  tabs: string[];
  active: string | null;
  mode: ViewMode;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  leftPanel: "files" | "search";
  bp: Breakpoint;
  overlayLeft: boolean;
  overlayRight: boolean;
  sheet: Sheet;
  modal: ModalKind;
  conflictPath: string | null;
  expanded: string[];
  recent: string[];
  searchSeed: string;
  searchSeedNonce: number;
  focusTitleNonce: number;
  cursorLine: number;
  reveal: { path: string; heading?: string; line?: number } | null;
  /** folder in which the file tree should show an inline "new folder" input ("" = root) */
  newFolderDir: string | null;
}

export const LEFT_MIN = 200, LEFT_MAX = 420, RIGHT_MIN = 240, RIGHT_MAX = 420;

const LAYOUT_KEY = "jotter.layout.v1";

interface Persisted { mode?: ViewMode; leftOpen?: boolean; rightOpen?: boolean; leftWidth?: number; rightWidth?: number; expanded?: string[] }

function loadPersisted(): Persisted {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Persisted; } catch { return {}; }
}
const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" ? Math.min(hi, Math.max(lo, n)) : d);

export function createInitialState(): UIState {
  const p: Persisted = typeof window === "undefined" ? {} : loadPersisted();
  return {
    phase: "loading", error: null, session: null, encrypted: false,
    tabs: [], active: null,
    mode: p.mode === "source" || p.mode === "live" || p.mode === "reading" ? p.mode : "live",
    leftOpen: p.leftOpen ?? true, rightOpen: p.rightOpen ?? true,
    leftWidth: clamp(p.leftWidth, LEFT_MIN, LEFT_MAX, 260), rightWidth: clamp(p.rightWidth, RIGHT_MIN, RIGHT_MAX, 280),
    leftPanel: "files", bp: "wide", overlayLeft: false, overlayRight: false, sheet: null,
    modal: null, conflictPath: null,
    expanded: Array.isArray(p.expanded) ? p.expanded.filter((x) => typeof x === "string") : [],
    recent: [], searchSeed: "", searchSeedNonce: 0, focusTitleNonce: 0, cursorLine: 0, reveal: null, newFolderDir: null,
  };
}

export const ui = createStore<UIState>(createInitialState());

export function persistLayout() {
  const s = ui.get();
  const data: Persisted = { mode: s.mode, leftOpen: s.leftOpen, rightOpen: s.rightOpen, leftWidth: s.leftWidth, rightWidth: s.rightWidth, expanded: s.expanded };
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

const tabsKey = (repo: string) => `jotter.tabs.v1.${repo}`;
export function persistTabs() {
  const s = ui.get();
  const r = s.session?.repo;
  if (!r) return;
  try { localStorage.setItem(tabsKey(`${r.owner}/${r.name}`), JSON.stringify({ tabs: s.tabs, active: s.active })); } catch { /* ignore */ }
}
export function loadTabs(repo: string, exists: (p: string) => boolean): { tabs: string[]; active: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(tabsKey(repo)) ?? "null") as { tabs?: string[]; active?: string | null } | null;
    const tabs = (raw?.tabs ?? []).filter((p) => typeof p === "string" && exists(p));
    const active = raw?.active && tabs.includes(raw.active) ? raw.active : (tabs[0] ?? null);
    return { tabs, active };
  } catch { return { tabs: [], active: null }; }
}
