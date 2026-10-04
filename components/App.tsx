"use client";
import { useEffect, useLayoutEffect } from "react";
import { LoadingScreen, Opening, RepoPicker, SignIn, UnlockCard, ErrorScreen } from "./Screens";
import { Shell } from "./Shell";
import { Palette } from "./Palette";
import { SettingsModal } from "./Settings";
import { ConflictResolver } from "./ConflictResolver";
import { ConfirmHost, ToastHost } from "./Hosts";
import { IS_MAC } from "./ui";
import { ui } from "@/lib/ui/state";
import { useStore } from "@/lib/ui/store";
import { bootstrap, buildCommandContext, closeOverlays, showLeftPanel, toggleRight } from "@/lib/ui/actions";
import { registry } from "@/lib/ui/commands";
import { initSettings } from "@/lib/ui/settings";
import { flushAll, hasPendingEdits } from "@/lib/ui/editors";
import { hasUnsyncedChanges } from "@/lib/ui/vault";
import { noteTitle } from "@/lib/ui/wikilink";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function App() {
  const phase = useStore(ui, (s) => s.phase);
  const modal = useStore(ui, (s) => s.modal);
  const error = useStore(ui, (s) => s.error);
  const active = useStore(ui, (s) => s.active);

  useLayoutEffect(() => { initSettings(); }, []);
  useEffect(() => { void bootstrap(); }, []);

  // breakpoints: wide >= 1024, mid 640-1023, narrow < 640
  useLayoutEffect(() => {
    const wide = matchMedia("(min-width: 1024px)");
    const mid = matchMedia("(min-width: 640px)");
    const update = () => {
      const bp = wide.matches ? "wide" : mid.matches ? "mid" : "narrow";
      if (ui.get().bp !== bp) { ui.set({ bp }); closeOverlays(); }
    };
    update();
    wide.addEventListener("change", update);
    mid.addEventListener("change", update);
    return () => { wide.removeEventListener("change", update); mid.removeEventListener("change", update); };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const mac = IS_MAC();
    const onKey = (e: KeyboardEvent) => {
      if (ui.get().phase !== "ready") return;
      if (!(e.ctrlKey || e.metaKey || e.altKey) && e.key !== "F2") return;
      const ctx = buildCommandContext();
      const cmd = registry.byEvent(e, ctx, mac);
      if (!cmd) return;
      if (cmd.shortcut === "F2" && isTyping(e.target)) return;
      e.preventDefault();
      cmd.run(ctx);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // never lose an edit, and warn before leaving with unsynced changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ui.get().phase !== "ready") return;
      void flushAll();
      if (hasPendingEdits() || hasUnsyncedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onHide = () => { if (document.visibilityState === "hidden") void flushAll(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // edge swipes open the sheets on narrow and mid layouts
  useEffect(() => {
    let start: { x: number; y: number; side: "left" | "right" } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      const s = ui.get();
      if (s.phase !== "ready" || s.bp === "wide" || s.modal) return;
      start = t.clientX < 24 ? { x: t.clientX, y: t.clientY, side: "left" } : t.clientX > window.innerWidth - 24 ? { x: t.clientX, y: t.clientY, side: "right" } : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      if (dy < 48) {
        if (start.side === "left" && dx > 60) showLeftPanel("files");
        if (start.side === "right" && dx < -60) toggleRight();
      }
      start = null;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchend", up); };
  }, []);

  useEffect(() => {
    document.title = phase === "ready" && active ? `${noteTitle(active)} - Jotter` : "Jotter";
  }, [phase, active]);

  let screen: React.ReactNode;
  switch (phase) {
    case "loading": screen = <LoadingScreen />; break;
    case "signin": screen = <SignIn />; break;
    case "repo": screen = <RepoPicker />; break;
    case "opening": screen = <Opening />; break;
    case "unlock": screen = <UnlockCard />; break;
    case "error": screen = <ErrorScreen message={error ?? "Something went wrong."} onRetry={() => void bootstrap()} />; break;
    case "ready": screen = <Shell />; break;
  }
  return (
    <>
      <a className="skip-link" href="#note-panel">Skip to note</a>
      {screen}
      {phase === "ready" && modal === "palette" ? <Palette mode="commands" /> : null}
      {phase === "ready" && modal === "switcher" ? <Palette mode="files" /> : null}
      {phase === "ready" && modal === "settings" ? <SettingsModal /> : null}
      {phase === "ready" && modal === "conflicts" ? <ConflictResolver /> : null}
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
