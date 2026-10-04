"use client";
import { useSyncExternalStore } from "react";

/** A tiny external store; select primitives or stable references from it with useStore. */
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(cb: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof T)[]) if (!Object.is(state[k], p[k])) { changed = true; break; }
      if (!changed) return;
      state = { ...state, ...p };
      for (const cb of [...subs]) cb();
    },
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
