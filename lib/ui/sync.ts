"use client";
import { useMemo } from "react";
import { vault, useVaultVersion } from "./vault";
import type { Conflict, FileNode, SyncState } from "@/lib/types";

const DEFAULT: SyncState = { kind: "synced" };

export function useSyncState(): SyncState {
  const v = useVaultVersion(["sync", "conflict"]);
  return useMemo(() => {
    try { return vault().syncState(); } catch { return DEFAULT; }
  }, [v]);
}

export function useConflicts(): Conflict[] {
  const v = useVaultVersion(["conflict", "sync"]);
  return useMemo(() => {
    try { return vault().conflicts(); } catch { return []; }
  }, [v]);
}

export function unsyncedPaths(tree: FileNode[], out = new Set<string>()): Set<string> {
  for (const n of tree) {
    if (n.type === "file") { if (n.unsynced) out.add(n.path); } else if (n.children) unsyncedPaths(n.children, out);
  }
  return out;
}
