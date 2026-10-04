import { openDB, type IDBPDatabase } from "idb";
import type { NoteRecord, RepoRef } from "../types";

export interface AttachmentRecord {
  path: string;
  bytes: ArrayBuffer;
  /** remote blob sha at last sync; null if never pushed */
  baseSha: string | null;
  dirty: boolean;
  deleted?: boolean;
  updatedAt: number;
}

export interface Batch {
  notes?: NoteRecord[];
  deleteNotes?: string[];
  attachments?: AttachmentRecord[];
  deleteAttachments?: string[];
  meta?: Record<string, unknown>;
}

export function dbName(repo: RepoRef): string {
  return `jotter:${repo.owner}/${repo.name}#${repo.branch}`;
}

/** Per-vault IndexedDB. Every write resolves only after its transaction completes. */
export class VaultDb {
  private constructor(private db: IDBPDatabase) {}

  static async open(repo: RepoRef): Promise<VaultDb> {
    const db = await openDB(dbName(repo), 1, {
      upgrade(d) {
        d.createObjectStore("notes", { keyPath: "path" });
        d.createObjectStore("attachments", { keyPath: "path" });
        d.createObjectStore("meta");
      },
    });
    return new VaultDb(db);
  }

  allNotes(): Promise<NoteRecord[]> { return this.db.getAll("notes"); }
  allAttachments(): Promise<AttachmentRecord[]> { return this.db.getAll("attachments"); }
  getMeta<T>(key: string): Promise<T | undefined> { return this.db.get("meta", key); }

  /** Atomic multi-store write. Resolves after the transaction is durable. */
  async commit(b: Batch): Promise<void> {
    const tx = this.db.transaction(["notes", "attachments", "meta"], "readwrite");
    const notes = tx.objectStore("notes");
    const atts = tx.objectStore("attachments");
    const meta = tx.objectStore("meta");
    const ops: Promise<unknown>[] = [];
    for (const p of b.deleteNotes ?? []) ops.push(notes.delete(p));
    for (const r of b.notes ?? []) ops.push(notes.put(r));
    for (const p of b.deleteAttachments ?? []) ops.push(atts.delete(p));
    for (const r of b.attachments ?? []) ops.push(atts.put(r));
    for (const [k, v] of Object.entries(b.meta ?? {})) ops.push(meta.put(v, k));
    await Promise.all([...ops, tx.done]);
  }

  close(): void { this.db.close(); }
}
