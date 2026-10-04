"use client";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { getVault } from "@/lib/vault";
import type { VaultService } from "@/lib/types";

export const vault = (): VaultService => getVault();

/**
 * Re-render when any of the given vault events fire. Returns a version number; derive data from the
 * vault in a useMemo keyed on it (vault getters may return fresh arrays, so they cannot be snapshots).
 */
export function useVaultVersion(events: readonly string[]): number {
  const version = useRef(0);
  const key = events.join("|");
  const subscribe = useCallback(
    (cb: () => void) => {
      const v = getVault();
      const offs = key.split("|").filter(Boolean).map((e) => v.subscribe(e, () => { version.current++; cb(); }));
      return () => offs.forEach((o) => o());
    },
    [key],
  );
  return useSyncExternalStore(subscribe, () => version.current, () => 0);
}

/** True when the vault has changes that are not on GitHub yet. Defensive about the facade's shape. */
export function hasUnsyncedChanges(): boolean {
  try {
    const v = getVault() as VaultService & { hasUnsavedChanges?: () => boolean };
    if (typeof v.hasUnsavedChanges === "function" && v.hasUnsavedChanges()) return true;
    if (typeof v.syncState === "function") {
      const k = v.syncState().kind;
      return k === "unsynced" || k === "conflict" || k === "syncing";
    }
  } catch { /* vault not ready */ }
  return false;
}
