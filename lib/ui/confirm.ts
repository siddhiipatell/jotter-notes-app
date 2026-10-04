"use client";
import { createStore } from "./store";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve(ok: boolean): void;
}
export const confirmStore = createStore<{ request: ConfirmRequest | null }>({ request: null });

/** Ask the user to confirm; resolves false on cancel/escape. Rendered by ConfirmHost. */
export function confirmDialog(opts: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmStore.get().request?.resolve(false);
    confirmStore.set({ request: { ...opts, resolve: (ok) => { confirmStore.set({ request: null }); resolve(ok); } } });
  });
}
