"use client";
import { X } from "lucide-react";
import { Button, Modal } from "./ui";
import { confirmStore } from "@/lib/ui/confirm";
import { toastStore, dismissToast } from "@/lib/ui/toast";
import { useStore } from "@/lib/ui/store";

export function ConfirmHost() {
  const req = useStore(confirmStore, (s) => s.request);
  if (!req) return null;
  return (
    <Modal onClose={() => req.resolve(false)} label={req.title} className="confirm">
      <h2 className="modal-title">{req.title}</h2>
      <p className="muted modal-text">{req.message}</p>
      <div className="modal-actions">
        <Button data-autofocus onClick={() => req.resolve(false)}>{req.cancelLabel ?? "Cancel"}</Button>
        <Button variant={req.destructive ? "danger" : "primary"} onClick={() => req.resolve(true)}>{req.confirmLabel ?? "Confirm"}</Button>
      </div>
    </Modal>
  );
}

export function ToastHost() {
  const toasts = useStore(toastStore, (s) => s.toasts);
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          {t.kind === "error" ? <span className="dot dot-conflict" aria-hidden="true" /> : null}
          <span>{t.message}</span>
          <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X size={14} strokeWidth={1.5} /></button>
        </div>
      ))}
    </div>
  );
}
