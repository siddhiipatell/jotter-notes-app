"use client";
import { createStore, useStore } from "./store";
import type { ViewMode } from "./commands";

export type ThemeChoice = "system" | "light" | "dark";
export type NoteFont = "inter" | "system" | "serif" | "mono";

export interface Settings {
  theme: ThemeChoice;
  fontSize: number;
  noteFont: NoteFont;
  readableWidth: boolean;
  defaultMode: ViewMode;
  spellcheck: boolean;
}

export const SETTINGS_KEY = "jotter.settings.v1";
export const DEFAULT_SETTINGS: Settings = { theme: "system", fontSize: 16, noteFont: "inter", readableWidth: true, defaultMode: "live", spellcheck: true };

export const NOTE_FONTS: Record<NoteFont, { label: string; css: string }> = {
  inter: { label: "Inter", css: "var(--font-inter)" },
  system: { label: "System UI", css: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  serif: { label: "Newsreader (serif)", css: "var(--font-newsreader), Newsreader, Georgia, 'Times New Roman', serif" },
  mono: { label: "Geist Mono", css: "var(--font-geist-mono)" },
};

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  return {
    theme: r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : d.theme,
    fontSize: typeof r.fontSize === "number" && r.fontSize >= 12 && r.fontSize <= 24 ? Math.round(r.fontSize) : d.fontSize,
    noteFont: r.noteFont && r.noteFont in NOTE_FONTS ? r.noteFont : d.noteFont,
    readableWidth: typeof r.readableWidth === "boolean" ? r.readableWidth : d.readableWidth,
    defaultMode: r.defaultMode === "source" || r.defaultMode === "live" || r.defaultMode === "reading" ? r.defaultMode : d.defaultMode,
    spellcheck: typeof r.spellcheck === "boolean" ? r.spellcheck : d.spellcheck,
  };
}

function load(): Settings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SETTINGS_KEY) : null;
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const settingsStore = createStore<Settings>(typeof window === "undefined" ? DEFAULT_SETTINGS : load());

export function applySettings(s: Settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (s.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", s.theme);
  root.style.setProperty("--note-font-size", `${s.fontSize}px`);
  root.style.setProperty("--note-scale", String(s.fontSize / 16));
  root.style.setProperty("--note-font", NOTE_FONTS[s.noteFont].css);
  root.style.setProperty("--note-measure", s.readableWidth ? "720px" : "100%");
}

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set(patch);
  const s = settingsStore.get();
  applySettings(s);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function initSettings() { applySettings(settingsStore.get()); }

export function useSettings(): Settings {
  const theme = useStore(settingsStore, (s) => s.theme);
  const fontSize = useStore(settingsStore, (s) => s.fontSize);
  const noteFont = useStore(settingsStore, (s) => s.noteFont);
  const readableWidth = useStore(settingsStore, (s) => s.readableWidth);
  const defaultMode = useStore(settingsStore, (s) => s.defaultMode);
  const spellcheck = useStore(settingsStore, (s) => s.spellcheck);
  return { theme, fontSize, noteFont, readableWidth, defaultMode, spellcheck };
}

export function effectiveTheme(): "light" | "dark" {
  const t = settingsStore.get().theme;
  if (t !== "system") return t;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleTheme() {
  updateSettings({ theme: effectiveTheme() === "dark" ? "light" : "dark" });
}

/** Inline script (runs before first paint) so the saved theme and font settings never flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}");var r=document.documentElement;if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);if(typeof s.fontSize==="number"){r.style.setProperty("--note-font-size",s.fontSize+"px");r.style.setProperty("--note-scale",String(s.fontSize/16));}if(s.readableWidth===false)r.style.setProperty("--note-measure","100%");}catch(e){}})();`;
