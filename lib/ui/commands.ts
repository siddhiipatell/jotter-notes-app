import { fuzzyMatch } from "./fuzzy";

/** Command registry and keyboard shortcuts. Pure: all effects go through CommandContext. */

export type ViewMode = "source" | "live" | "reading";

export interface CommandContext {
  hasActiveNote: boolean;
  mode: ViewMode;
  syncKind: string;
  encrypted: boolean;
  conflictCount: number;
  newNote(): void;
  openPalette(): void;
  openSwitcher(): void;
  openSettings(): void;
  openConflicts(): void;
  openDaily(): void;
  setMode(mode: ViewMode): void;
  cycleMode(): void;
  toggleLeft(): void;
  toggleRight(): void;
  showSearch(): void;
  showFiles(): void;
  closeTab(): void;
  nextTab(): void;
  prevTab(): void;
  pushNow(): void;
  pullNow(): void;
  toggleTheme(): void;
  lock(): void;
  switchRepo(): void;
  logout(): void;
  focusTitle(): void;
  deleteNote(): void;
}

export interface Command {
  id: string;
  title: string;
  description?: string;
  /** e.g. "Mod+Shift+F". Mod = Cmd on macOS, Ctrl elsewhere. */
  shortcut?: string;
  keywords?: string[];
  when?: (ctx: CommandContext) => boolean;
  run(ctx: CommandContext): void;
}

const hasNote = (c: CommandContext) => c.hasActiveNote;

export function defaultCommands(): Command[] {
  return [
    { id: "note.new", title: "New note", description: "Create an untitled note", shortcut: "Mod+Alt+N", keywords: ["create", "add"], run: (c) => c.newNote() },
    { id: "note.daily", title: "Open daily note", description: "Today's note, created if missing", keywords: ["today", "journal"], run: (c) => c.openDaily() },
    { id: "note.switch", title: "Go to note", description: "Quick switcher", shortcut: "Mod+O", keywords: ["open", "find", "file"], run: (c) => c.openSwitcher() },
    { id: "note.rename", title: "Rename note", description: "Edit the note title", shortcut: "F2", when: hasNote, run: (c) => c.focusTitle() },
    { id: "note.delete", title: "Delete note", description: "Remove the current note", when: hasNote, keywords: ["remove", "trash"], run: (c) => c.deleteNote() },
    { id: "tab.close", title: "Close tab", shortcut: "Mod+Alt+W", when: hasNote, run: (c) => c.closeTab() },
    { id: "tab.next", title: "Next tab", shortcut: "Mod+Alt+ArrowRight", when: hasNote, run: (c) => c.nextTab() },
    { id: "tab.prev", title: "Previous tab", shortcut: "Mod+Alt+ArrowLeft", when: hasNote, run: (c) => c.prevTab() },
    { id: "mode.source", title: "Switch to Source mode", when: hasNote, keywords: ["edit", "markdown"], run: (c) => c.setMode("source") },
    { id: "mode.live", title: "Switch to Live Preview mode", when: hasNote, keywords: ["edit", "wysiwyg"], run: (c) => c.setMode("live") },
    { id: "mode.reading", title: "Switch to Reading mode", when: hasNote, keywords: ["view", "read"], run: (c) => c.setMode("reading") },
    { id: "mode.cycle", title: "Cycle editor mode", description: "Source, Live Preview, Reading", shortcut: "Mod+E", when: hasNote, run: (c) => c.cycleMode() },
    { id: "view.left", title: "Toggle left sidebar", shortcut: "Mod+\\", keywords: ["files", "panel"], run: (c) => c.toggleLeft() },
    { id: "view.right", title: "Toggle right sidebar", shortcut: "Mod+Shift+\\", keywords: ["backlinks", "outline", "properties", "panel"], run: (c) => c.toggleRight() },
    { id: "view.files", title: "Show file explorer", shortcut: "Mod+Shift+E", run: (c) => c.showFiles() },
    { id: "view.search", title: "Search in all notes", shortcut: "Mod+Shift+F", keywords: ["find", "text", "tag"], run: (c) => c.showSearch() },
    { id: "sync.push", title: "Push now", description: "Commit local changes to GitHub", shortcut: "Mod+S", keywords: ["save", "sync", "commit"], run: (c) => c.pushNow() },
    { id: "sync.pull", title: "Pull now", description: "Fetch changes from GitHub", keywords: ["sync", "fetch", "refresh"], run: (c) => c.pullNow() },
    { id: "sync.conflicts", title: "Resolve conflicts", description: "Compare Mine and Theirs", when: (c) => c.conflictCount > 0, keywords: ["merge", "diff"], run: (c) => c.openConflicts() },
    { id: "app.theme", title: "Toggle light and dark theme", keywords: ["appearance", "mode", "color"], run: (c) => c.toggleTheme() },
    { id: "app.settings", title: "Open settings", shortcut: "Mod+,", keywords: ["preferences", "options", "encryption", "font"], run: (c) => c.openSettings() },
    { id: "app.palette", title: "Open command palette", shortcut: "Mod+P", run: (c) => c.openPalette() },
    { id: "app.lock", title: "Lock vault", description: "Require the passphrase again", when: (c) => c.encrypted, keywords: ["passphrase", "security"], run: (c) => c.lock() },
    { id: "app.repo", title: "Switch repository", keywords: ["vault", "github"], run: (c) => c.switchRepo() },
    { id: "app.logout", title: "Sign out", keywords: ["log out", "github"], run: (c) => c.logout() },
  ];
}

export class CommandRegistry {
  private map = new Map<string, Command>();
  constructor(commands: Command[] = defaultCommands()) { for (const c of commands) this.register(c); }
  register(cmd: Command): () => void {
    this.map.set(cmd.id, cmd);
    return () => { this.map.delete(cmd.id); };
  }
  get(id: string) { return this.map.get(id); }
  available(ctx: CommandContext): Command[] {
    return [...this.map.values()].filter((c) => !c.when || c.when(ctx));
  }
  /** Fuzzy-search available commands by title, description and keywords. */
  search(query: string, ctx: CommandContext): Command[] {
    const list = this.available(ctx);
    if (!query.trim()) return list;
    const scored: { c: Command; s: number; i: number }[] = [];
    list.forEach((c, i) => {
      const t = fuzzyMatch(query, c.title);
      const k = fuzzyMatch(query, [c.description ?? "", ...(c.keywords ?? [])].join(" "));
      const s = Math.max(t ? t.score + 20 : -Infinity, k ? k.score : -Infinity);
      if (s > -Infinity) scored.push({ c, s, i });
    });
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    return scored.map((x) => x.c);
  }
  run(id: string, ctx: CommandContext): boolean {
    const c = this.map.get(id);
    if (!c || (c.when && !c.when(ctx))) return false;
    c.run(ctx);
    return true;
  }
  /** Find the command a keyboard event triggers, if any. */
  byEvent(e: KeyEventLike, ctx: CommandContext, isMac: boolean): Command | undefined {
    return this.available(ctx).find((c) => c.shortcut && matchesShortcut(e, c.shortcut, isMac));
  }
}

export interface KeyEventLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

export interface ParsedShortcut { mod: boolean; shift: boolean; alt: boolean; key: string }

export function parseShortcut(spec: string): ParsedShortcut {
  const parts = spec.split("+");
  // a trailing "+" key would produce an empty last segment; no default shortcut uses it
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  return { mod: mods.includes("mod"), shift: mods.includes("shift"), alt: mods.includes("alt"), key };
}

export function matchesShortcut(e: KeyEventLike, spec: string, isMac: boolean): boolean {
  const s = parseShortcut(spec);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const wrongMod = isMac ? e.ctrlKey : e.metaKey;
  if (s.mod !== mod || wrongMod) return false;
  if (s.shift !== e.shiftKey || s.alt !== e.altKey) return false;
  const want = s.key.length === 1 ? s.key.toLowerCase() : s.key;
  const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (want === got) return true;
  // Alt+letter yields a symbol on macOS; fall back to the physical key
  if (s.alt && e.code && /^[A-Za-z]$/.test(s.key)) return e.code === "Key" + s.key.toUpperCase();
  // Shift+\ reports "|" on US layouts; Alt+letter reports a symbol on macOS (handled by code in caller if needed)
  return s.shift && s.key === "\\" && got === "|";
}

const MAC_GLYPH: Record<string, string> = { ArrowRight: "→", ArrowLeft: "←", ArrowUp: "↑", ArrowDown: "↓", Enter: "↵", Escape: "Esc" };

/** Split a shortcut into display keys, e.g. ["Ctrl","Shift","F"] or ["⌘","⇧","F"]. */
export function shortcutKeys(spec: string, isMac: boolean): string[] {
  const s = parseShortcut(spec);
  const out: string[] = [];
  if (s.mod) out.push(isMac ? "⌘" : "Ctrl");
  if (s.alt) out.push(isMac ? "⌥" : "Alt");
  if (s.shift) out.push(isMac ? "⇧" : "Shift");
  out.push(MAC_GLYPH[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key));
  return out;
}

export const formatShortcut = (spec: string, isMac: boolean) => shortcutKeys(spec, isMac).join(isMac ? "" : "+");

export function nextMode(m: ViewMode): ViewMode {
  return m === "source" ? "live" : m === "live" ? "reading" : "source";
}

/** The app-wide registry. Extra commands can be registered at runtime. */
export const registry = new CommandRegistry();
