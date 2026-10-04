"use client";
import { createStore } from "./store";

export interface Toast { id: number; message: string; kind: "info" | "error" }
export const toastStore = createStore<{ toasts: Toast[] }>({ toasts: [] });
let nextId = 1;

export function notify(message: string, kind: Toast["kind"] = "info", ms = 5000) {
  const id = nextId++;
  toastStore.set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
  setTimeout(() => dismissToast(id), ms);
}
export function dismissToast(id: number) {
  toastStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
