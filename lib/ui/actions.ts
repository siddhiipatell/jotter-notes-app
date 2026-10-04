"use client";
import { ui, persistLayout, persistTabs, loadTabs, LEFT_MIN, LEFT_MAX, RIGHT_MIN, RIGHT_MAX, type Phase } from "./state";
import { vault, hasUnsyncedChanges } from "./vault";
import { flushAll, getEditor } from "./editors";
import { notify, errorMessage } from "./toast";
import { confirmDialog } from "./confirm";
import { toggleTheme } from "./settings";
import { nextMode, type CommandContext, type ViewMode } from "./commands";
import { basename, dirname, joinPath, isNotePath, noteTitle, findAttachment } from "./wikilink";
import * as api from "./api";
import type { RepoRef } from "@/lib/types";

/* ---------------------------------- session / lifecycle ---------------------------------- */

export async function bootstrap() {
  try {
    const session = await api.getSession();
    ui.set({ session });
    if (!session.user) return ui.set({ phase: "signin" });
    if (!session.repo) return ui.set({ phase: "repo" });
    await openRepo(session.repo);
  } catch (e) {
    ui.set({ phase: "signin", error: errorMessage(e) });
  }
}

export async function openRepo(repo: RepoRef) {
  ui.set({ phase: "opening", error: null, tabs: [], active: null, modal: null, sheet: null });
  try {
    const r = await vault().open(repo);
    ui.set({ encrypted: r.encrypted });
    if (r.needsPassphrase) return ui.set({ phase: "unlock" });
    enterReady(repo);
  } catch (e) {
    ui.set({ phase: "error", error: errorMessage(e) });
  }
}

export function enterReady(repo: RepoRef) {
  const key = `${repo.owner}/${repo.name}`;
  const { tabs, active } = loadTabs(key, (p) => vault().listPaths().includes(p));
  ui.set({ phase: "ready", tabs, active });
}

export async function unlockVault(passphrase: string) {
  await vault().unlock(passphrase);
  const repo = ui.get().session?.repo;
  if (repo) enterReady(repo);
}

export async function chooseRepo(repo: RepoRef) {
  await api.selectRepo(repo);
  const session = await api.getSession();
  ui.set({ session });
  await openRepo(repo);
}

export async function switchRepo() {
  if (!(await guardUnsynced("Switch repository"))) return;
  await flushAll();
  await vault().close().catch(() => undefined);
  ui.set({ phase: "repo", tabs: [], active: null, modal: null, sheet: null });
}

export async function lockVault() {
  await flushAll();
  const repo = ui.get().session?.repo;
  if (!repo) return;
  await vault().close().catch(() => undefined);
  await openRepo(repo);
}

export async function logout() {
  if (!(await guardUnsynced("Sign out"))) return;
  await flushAll();
  await vault().close().catch(() => undefined);
  try { await api.logoutRequest(); } catch (e) { notify(errorMessage(e), "error"); }
  ui.set({ session: null, phase: "signin", tabs: [], active: null, modal: null, sheet: null });
}

async function guardUnsynced(action: string): Promise<boolean> {
  if (!hasUnsyncedChanges()) return true;
  return confirmDialog({
    title: `${action}?`,
    message: "Some changes are not on GitHub yet. They stay saved in this browser, but you will need to open this repository here again to push them.",
    confirmLabel: action,
    destructive: true,
  });
}

/* ---------------------------------- layout ---------------------------------- */

export function toggleLeft() {
  const s = ui.get();
  if (s.bp === "wide") ui.set({ leftOpen: !s.leftOpen });
  else if (s.bp === "mid") ui.set({ overlayLeft: !s.overlayLeft, overlayRight: false });
  else ui.set({ sheet: s.sheet === "files" || s.sheet === "search" ? null : "files" });
  persistLayout();
}
export function toggleRight() {
  const s = ui.get();
  if (s.bp === "wide") ui.set({ rightOpen: !s.rightOpen });
  else if (s.bp === "mid") ui.set({ overlayRight: !s.overlayRight, overlayLeft: false });
  else ui.set({ sheet: s.sheet === "right" ? null : "right" });
  persistLayout();
}
export function showLeftPanel(panel: "files" | "search") {
  const s = ui.get();
  if (s.bp === "wide") ui.set({ leftOpen: true, leftPanel: panel });
  else if (s.bp === "mid") ui.set({ overlayLeft: true, overlayRight: false, leftPanel: panel });
  else ui.set({ sheet: panel, leftPanel: panel });
  persistLayout();
}
export function closeOverlays() { ui.set({ overlayLeft: false, overlayRight: false, sheet: null }); }
export function setLeftWidth(w: number) { ui.set({ leftWidth: Math.round(Math.min(LEFT_MAX, Math.max(LEFT_MIN, w))) }); }
export function setRightWidth(w: number) { ui.set({ rightWidth: Math.round(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, w))) }); }
export function setMode(mode: ViewMode) { void flushAll(); ui.set({ mode }); persistLayout(); }
export function openSearch(seed = "") {
  ui.set((s) => ({ searchSeed: seed, searchSeedNonce: s.searchSeedNonce + 1 }));
  showLeftPanel("search");
}
export function setModal(modal: "palette" | "switcher" | "settings" | "conflicts" | null, conflictPath: string | null = null) {
  ui.set({ modal, conflictPath });
}

/* ---------------------------------- tabs / navigation ---------------------------------- */

function pushRecent(path: string) {
  ui.set((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 30) }));
}

export function openNote(path: string, opts: { newTab?: boolean; heading?: string; line?: number } = {}) {
  const s = ui.get();
  let tabs = s.tabs;
  if (!tabs.includes(path)) {
    if (opts.newTab || !s.active || !tabs.includes(s.active)) tabs = [...tabs, path];
    else tabs = tabs.map((t) => (t === s.active ? path : t));
  }
  ui.set({ tabs, active: path, reveal: opts.heading || opts.line !== undefined ? { path, heading: opts.heading, line: opts.line } : null });
  pushRecent(path);
  persistTabs();
  if (s.bp !== "wide") closeOverlays();
}

export function activateTab(path: string) { ui.set({ active: path }); pushRecent(path); persistTabs(); }

export function closeTab(path: string | null = ui.get().active) {
  if (!path) return;
  const s = ui.get();
  const i = s.tabs.indexOf(path);
  if (i < 0) return;
  const tabs = s.tabs.filter((t) => t !== path);
  const active = s.active === path ? (tabs[Math.min(i, tabs.length - 1)] ?? null) : s.active;
  ui.set({ tabs, active });
  persistTabs();
}
export function cycleTab(dir: 1 | -1) {
  const { tabs, active } = ui.get();
  if (tabs.length < 2 || !active) return;
  const i = tabs.indexOf(active);
  activateTab(tabs[(i + dir + tabs.length) % tabs.length]);
}

/** Apply path changes (rename/move) to tabs, recents and expanded folders. */
export function remapPaths(map: Map<string, string>) {
  const re = (p: string) => map.get(p) ?? p;
  ui.set((s) => ({
    tabs: [...new Set(s.tabs.map(re))],
    active: s.active ? re(s.active) : null,
    recent: [...new Set(s.recent.map(re))],
  }));
  persistTabs();
}

export function toggleFolder(path: string, open?: boolean) {
  ui.set((s) => {
    const has = s.expanded.includes(path);
    const want = open ?? !has;
    if (want === has) return {};
    return { expanded: want ? [...s.expanded, path] : s.expanded.filter((p) => p !== path) };
  });
  persistLayout();
}

/* ---------------------------------- file operations ---------------------------------- */

const INVALID_NAME = /[\\/:*?"<>|]/;
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Name cannot be empty";
  if (INVALID_NAME.test(n)) return 'Names cannot contain \\ / : * ? " < > |';
  if (n.startsWith(".")) return "Names cannot start with a dot";
  return null;
}

function uniquePath(dir: string, base: string, ext: string): string {
  const paths = new Set(vault().listPaths().map((p) => p.toLowerCase()));
  let n = 0;
  for (;;) {
    const name = n === 0 ? base : `${base} ${n}`;
    const p = joinPath(dir, name + ext);
    if (!paths.has(p.toLowerCase())) return p;
    n++;
  }
}

export function activeFolder(): string {
  const a = ui.get().active;
  return a ? dirname(a) : "";
}

export async function createNote(dir: string = activeFolder(), opts: { name?: string; content?: string; newTab?: boolean } = {}): Promise<string | null> {
  try {
    const path = uniquePath(dir, opts.name ?? "Untitled", ".md");
    await vault().create(path, opts.content ?? "");
    openNote(path, { newTab: opts.newTab });
    ui.set((s) => ({ focusTitleNonce: s.focusTitleNonce + 1 }));
    if (dir) toggleFolder(dir, true);
    return path;
  } catch (e) {
    notify(`Could not create note: ${errorMessage(e)}`, "error");
    return null;
  }
}

export async function createFolder(parent: string, name: string): Promise<void> {
  const err = validateName(name);
  if (err) return void notify(err, "error");
  // Git cannot store empty folders, so a new folder starts with one untitled note.
  const dir = joinPath(parent, name.trim());
  await createNote(dir);
  toggleFolder(dir, true);
}

export async function openDaily() {
  const d = new Date();
  const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const path = `Daily/${name}.md`;
  try {
    if (!vault().listPaths().includes(path)) await vault().create(path, "");
    openNote(path);
    toggleFolder("Daily", true);
  } catch (e) {
    notify(`Could not open daily note: ${errorMessage(e)}`, "error");
  }
}

async function moveAttachment(oldPath: string, newPath: string) {
  const url = await vault().readAttachmentUrl(oldPath);
  if (!url) throw new Error(`Could not read ${oldPath}`);
  const bytes = await (await fetch(url)).arrayBuffer();
  await vault().addAttachment(newPath, bytes);
  await vault().remove(oldPath);
}

/** Rename or move a file or folder. Notes use vault.rename (rewrites inbound links). */
export async function movePath(oldPath: string, newPath: string, type: "file" | "folder"): Promise<boolean> {
  if (oldPath === newPath) return true;
  await flushAll();
  const map = new Map<string, string>();
  try {
    const all = vault().listPaths();
    if (type === "file") {
      if (all.some((p) => p.toLowerCase() === newPath.toLowerCase() && p !== oldPath)) throw new Error(`"${basename(newPath)}" already exists`);
      if (isNotePath(oldPath)) await vault().rename(oldPath, newPath); else await moveAttachment(oldPath, newPath);
      map.set(oldPath, newPath);
    } else {
      if (newPath.startsWith(oldPath + "/")) throw new Error("Cannot move a folder into itself");
      const inside = all.filter((p) => p.startsWith(oldPath + "/"));
      if (inside.some((p) => all.includes(newPath + p.slice(oldPath.length)))) throw new Error("A file with the same name already exists in the destination");
      for (const p of inside.filter(isNotePath)) {
        const np = newPath + p.slice(oldPath.length);
        await vault().rename(p, np);
        map.set(p, np);
      }
      for (const p of inside.filter((x) => !isNotePath(x))) {
        const np = newPath + p.slice(oldPath.length);
        await moveAttachment(p, np);
        map.set(p, np);
      }
      ui.set((s) => ({ expanded: s.expanded.map((e) => (e === oldPath || e.startsWith(oldPath + "/") ? newPath + e.slice(oldPath.length) : e)) }));
    }
    remapPaths(map);
    return true;
  } catch (e) {
    remapPaths(map);
    notify(`Could not rename: ${errorMessage(e)}`, "error");
    return false;
  }
}

export async function renameEntry(path: string, newName: string, type: "file" | "folder"): Promise<boolean> {
  const err = validateName(newName);
  if (err) { notify(err, "error"); return false; }
  const name = type === "file" && isNotePath(path) ? newName.trim().replace(/\.md$/i, "") + ".md" : newName.trim();
  return movePath(path, joinPath(dirname(path), name), type);
}

export async function moveInto(path: string, type: "file" | "folder", destFolder: string): Promise<boolean> {
  if (dirname(path) === destFolder) return true;
  return movePath(path, joinPath(destFolder, basename(path)), type);
}

export async function deleteEntry(path: string, type: "file" | "folder"): Promise<boolean> {
  const label = type === "folder" ? basename(path) + " and everything in it" : noteTitle(path);
  const ok = await confirmDialog({
    title: `Delete ${label}?`,
    message: "It will be removed from GitHub on the next push. You can restore it from your repository's history.",
    confirmLabel: "Delete",
    destructive: true,
  });
  if (!ok) return false;
  try {
    const targets = type === "folder" ? vault().listPaths().filter((p) => p.startsWith(path + "/")) : [path];
    for (const p of targets) { getEditor(p) && (await getEditor(p)!.flush()); await vault().remove(p); closeTab(p); }
    return true;
  } catch (e) {
    notify(`Could not delete: ${errorMessage(e)}`, "error");
    return false;
  }
}

/** Open a wikilink target; creates the note if it does not exist. */
export async function openLink(target: string, fromPath: string, opts: { newTab?: boolean; heading?: string } = {}) {
  const v = vault();
  const resolved = target ? v.resolve(target, fromPath) : fromPath;
  if (resolved) return openNote(resolved, { newTab: opts.newTab, heading: opts.heading });
  if (/\.[A-Za-z0-9]{1,5}$/.test(target) && !/\.md$/i.test(target)) {
    const att = findAttachment(target, fromPath, v.listPaths());
    if (att) return openNote(att, { newTab: opts.newTab });
  }
  const clean = target.replace(/^\/+/, "").replace(/\.md$/i, "");
  if (!clean || clean.split("/").some((seg) => validateName(seg))) return notify(`"${target}" is not a valid note name`, "error");
  try {
    await v.create(clean + ".md", "");
    openNote(clean + ".md", { newTab: opts.newTab });
  } catch (e) {
    notify(`Could not create note: ${errorMessage(e)}`, "error");
  }
}

export async function addFiles(files: File[], dir = "attachments"): Promise<string[]> {
  const added: string[] = [];
  for (const f of files) {
    try {
      const safe = f.name.replace(INVALID_NAME, "-");
      const dot = safe.lastIndexOf(".");
      const base = dot > 0 ? safe.slice(0, dot) : safe;
      const ext = dot > 0 ? safe.slice(dot) : "";
      const path = uniquePath(dir, base, ext);
      await vault().addAttachment(path, await f.arrayBuffer());
      added.push(path);
    } catch (e) {
      notify(`Could not add ${f.name}: ${errorMessage(e)}`, "error");
    }
  }
  return added;
}

/* ---------------------------------- sync ---------------------------------- */

export async function pushNow() {
  try { await flushAll(); await vault().pushNow(); } catch (e) { notify(`Push failed: ${errorMessage(e)}`, "error"); }
}
export async function pullNow() {
  try { await flushAll(); await vault().pullNow(); } catch (e) { notify(`Pull failed: ${errorMessage(e)}`, "error"); }
}

/* ---------------------------------- commands ---------------------------------- */

export function buildCommandContext(): CommandContext {
  const s = ui.get();
  let conflictCount = 0;
  let syncKind = "synced";
  if (s.phase === "ready") {
    try { conflictCount = vault().conflicts().length; syncKind = vault().syncState().kind; } catch { /* not ready */ }
  }
  return {
    hasActiveNote: !!s.active, mode: s.mode, syncKind, encrypted: s.encrypted, conflictCount,
    newNote: () => void createNote(),
    openPalette: () => setModal("palette"),
    openSwitcher: () => setModal("switcher"),
    openSettings: () => setModal("settings"),
    openConflicts: () => setModal("conflicts", vault().conflicts()[0]?.path ?? null),
    openDaily: () => void openDaily(),
    setMode,
    cycleMode: () => setMode(nextMode(ui.get().mode)),
    toggleLeft, toggleRight,
    showSearch: () => openSearch(),
    showFiles: () => showLeftPanel("files"),
    closeTab: () => closeTab(),
    nextTab: () => cycleTab(1),
    prevTab: () => cycleTab(-1),
    pushNow: () => void pushNow(),
    pullNow: () => void pullNow(),
    toggleTheme,
    lock: () => void lockVault(),
    switchRepo: () => void switchRepo(),
    logout: () => void logout(),
    focusTitle: () => ui.set((st) => ({ focusTitleNonce: st.focusTitleNonce + 1 })),
    deleteNote: () => { const a = ui.get().active; if (a) void deleteEntry(a, "file"); },
  };
}

export type { Phase };
