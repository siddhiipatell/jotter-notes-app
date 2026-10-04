import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, defaultCommands, matchesShortcut, parseShortcut, formatShortcut, shortcutKeys, nextMode, type CommandContext } from "@/lib/ui/commands";

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  const fn = () => vi.fn();
  return {
    hasActiveNote: true, mode: "live", syncKind: "synced", encrypted: false, conflictCount: 0,
    newNote: fn(), openPalette: fn(), openSwitcher: fn(), openSettings: fn(), openConflicts: fn(), openDaily: fn(),
    setMode: fn(), cycleMode: fn(), toggleLeft: fn(), toggleRight: fn(), showSearch: fn(), showFiles: fn(),
    closeTab: fn(), nextTab: fn(), prevTab: fn(), pushNow: fn(), pullNow: fn(), toggleTheme: fn(), lock: fn(),
    switchRepo: fn(), logout: fn(), focusTitle: fn(), deleteNote: fn(),
    ...over,
  };
}
const key = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("command registry", () => {
  it("has unique ids and covers the required commands", () => {
    const ids = defaultCommands().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["note.new", "mode.cycle", "view.left", "view.right", "sync.push", "sync.pull", "app.theme", "app.settings", "app.lock", "app.logout"]) expect(ids).toContain(id);
  });
  it("hides commands whose `when` fails", () => {
    const r = new CommandRegistry();
    expect(r.available(ctx({ encrypted: false })).some((c) => c.id === "app.lock")).toBe(false);
    expect(r.available(ctx({ encrypted: true })).some((c) => c.id === "app.lock")).toBe(true);
    expect(r.available(ctx({ hasActiveNote: false })).some((c) => c.id === "mode.cycle")).toBe(false);
    expect(r.available(ctx({ conflictCount: 2 })).some((c) => c.id === "sync.conflicts")).toBe(true);
  });
  it("searches by title and keywords", () => {
    const r = new CommandRegistry();
    expect(r.search("push", ctx())[0].id).toBe("sync.push");
    expect(r.search("dark", ctx())[0].id).toBe("app.theme");
    expect(r.search("zzzzqq", ctx())).toEqual([]);
  });
  it("runs a command through the context", () => {
    const c = ctx();
    expect(new CommandRegistry().run("sync.push", c)).toBe(true);
    expect(c.pushNow).toHaveBeenCalledOnce();
    expect(new CommandRegistry().run("nope", c)).toBe(false);
  });
  it("supports registering extra commands", () => {
    const r = new CommandRegistry([]);
    const run = vi.fn();
    const off = r.register({ id: "x", title: "X", run });
    r.run("x", ctx());
    expect(run).toHaveBeenCalled();
    off();
    expect(r.get("x")).toBeUndefined();
  });
});

describe("shortcuts", () => {
  it("has no duplicate shortcuts", () => {
    const s = defaultCommands().map((c) => c.shortcut).filter(Boolean);
    expect(new Set(s).size).toBe(s.length);
  });
  it("matches Mod per platform", () => {
    expect(matchesShortcut(key("p", { ctrlKey: true }), "Mod+P", false)).toBe(true);
    expect(matchesShortcut(key("p", { metaKey: true }), "Mod+P", false)).toBe(false);
    expect(matchesShortcut(key("p", { metaKey: true }), "Mod+P", true)).toBe(true);
    expect(matchesShortcut(key("P", { ctrlKey: true }), "Mod+P", false)).toBe(true);
  });
  it("requires exact shift/alt state", () => {
    expect(matchesShortcut(key("f", { ctrlKey: true, shiftKey: true }), "Mod+Shift+F", false)).toBe(true);
    expect(matchesShortcut(key("f", { ctrlKey: true }), "Mod+Shift+F", false)).toBe(false);
    expect(matchesShortcut(key("f", { ctrlKey: true, shiftKey: true }), "Mod+F", false)).toBe(false);
  });
  it("matches Alt+letter by physical key (macOS symbols) and Shift+backslash", () => {
    expect(matchesShortcut(key("˜", { metaKey: true, altKey: true, code: "KeyN" }), "Mod+Alt+N", true)).toBe(true);
    expect(matchesShortcut(key("|", { ctrlKey: true, shiftKey: true }), "Mod+Shift+\\", false)).toBe(true);
  });
  it("finds a command by event", () => {
    expect(new CommandRegistry().byEvent(key("o", { ctrlKey: true }), ctx(), false)?.id).toBe("note.switch");
  });
  it("formats shortcuts for display", () => {
    expect(parseShortcut("Mod+Shift+F")).toEqual({ mod: true, shift: true, alt: false, key: "F" });
    expect(formatShortcut("Mod+Shift+F", false)).toBe("Ctrl+Shift+F");
    expect(formatShortcut("Mod+Shift+F", true)).toBe("⌘⇧F");
    expect(shortcutKeys("Mod+O", false)).toEqual(["Ctrl", "O"]);
  });
  it("cycles modes", () => {
    expect(nextMode("source")).toBe("live");
    expect(nextMode("live")).toBe("reading");
    expect(nextMode("reading")).toBe("source");
  });
});
