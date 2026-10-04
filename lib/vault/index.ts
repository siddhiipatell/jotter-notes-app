import type {
  Backlink, Conflict, FileNode, ParsedNote, RepoRef, SearchHit, SyncState, VaultService,
} from "../types";
import { buildTree } from "@/lib/core/folders";
import { computeRenameEdits } from "@/lib/core/links";
import { SyncEngine, type EngineOptions } from "../sync/engine";
import { IndexMirror, type AsyncIndex } from "./indexMirror";

export interface VaultOptions extends Omit<EngineOptions, "sink"> {
  /** inject an index client (tests); default is lib/core/workerClient createIndexClient() */
  indexFactory?: () => AsyncIndex | Promise<AsyncIndex>;
}

export class Vault implements VaultService {
  readonly engine: SyncEngine;
  private mirror: IndexMirror;
  private bus = new Map<string, Set<() => void>>();
  private treeCache: FileNode[] | null = null;

  constructor(opts: VaultOptions = {}) {
    // The index client may be created lazily (worker import); buffer calls until ready.
    const pending: AsyncIndex = lazyIndex(opts.indexFactory ?? defaultIndexFactory);
    this.mirror = new IndexMirror(pending, () => this.emit("index"));
    this.engine = new SyncEngine({ ...opts, sink: this.mirror });
    let lastAtt = "";
    this.engine.subscribe("tree", () => {
      this.treeCache = null;
      const att = this.engine.listPaths().filter((p) => !p.endsWith(".md"));
      const key = att.join("\n");
      if (key !== lastAtt) { lastAtt = key; this.mirror.setAttachments(att); }
      this.emit("tree");
    });
    this.engine.subscribe("sync", () => this.emit("sync"));
    this.engine.subscribe("conflict", () => this.emit("conflict"));
  }

  private emit(event: string) { for (const cb of [...(this.bus.get(event) ?? [])]) cb(); }
  subscribe(event: string, cb: () => void): () => void {
    if (event.startsWith("note:")) return this.engine.subscribe(event, cb);
    let s = this.bus.get(event);
    if (!s) this.bus.set(event, (s = new Set()));
    s.add(cb);
    return () => { s!.delete(cb); };
  }

  // lifecycle
  open(repo: RepoRef) { this.treeCache = null; return this.engine.open(repo); }
  unlock(passphrase: string) { return this.engine.unlock(passphrase); }
  enableEncryption(passphrase: string) { return this.engine.enableEncryption(passphrase); }
  disableEncryption() { return this.engine.disableEncryption(); }
  async close() { await this.engine.close(); }

  // notes
  listPaths() { return this.engine.listPaths(); }
  tree(): FileNode[] {
    return (this.treeCache ??= buildTree(this.engine.listPaths(), this.engine.unsyncedPaths()));
  }
  read(path: string) { return this.engine.read(path); }
  write(path: string, content: string) { return this.engine.write(path, content); }
  create(path: string, content = "") { return this.engine.create(path, content); }
  async rename(oldPath: string, newPath: string): Promise<{ updatedPaths: string[] }> {
    if (!oldPath.endsWith(".md")) throw new Error("Only notes can be renamed");
    await this.engine.read(oldPath);
    // every note must be local to rewrite links reliably
    await Promise.all(this.engine.listPaths().filter((p) => p.endsWith(".md")).map((p) => this.engine.read(p)));
    const edits = computeRenameEdits(oldPath, newPath, this.engine.noteContents());
    return { updatedPaths: await this.engine.renameNote(oldPath, newPath, edits) };
  }
  remove(path: string) { return this.engine.remove(path); }
  addAttachment(path: string, bytes: ArrayBuffer) { return this.engine.addAttachment(path, bytes); }
  readAttachmentUrl(path: string) { return this.engine.readAttachmentUrl(path); }

  // derived
  parsed(path: string): ParsedNote | undefined { return this.mirror.parsed(path); }
  backlinks(path: string): Backlink[] { return this.mirror.backlinks(path); }
  resolve(target: string, fromPath: string) { return this.mirror.resolve(target, fromPath); }
  search(query: string, limit?: number): SearchHit[] { return this.mirror.search(query, limit); }
  quickSwitch(query: string, limit?: number) { return this.mirror.quickSwitch(query, limit); }
  allTags() { return this.mirror.allTags(); }

  // sync
  syncState(): SyncState { return this.engine.syncState(); }
  pushNow() { return this.engine.pushNow(); }
  pullNow() { return this.engine.pullNow(); }
  conflicts(): Conflict[] { return this.engine.conflicts(); }
  resolveConflict(path: string, resolution: "mine" | "theirs" | string) { return this.engine.resolveConflict(path, resolution); }
  hasUnsavedChanges() { return this.engine.hasUnsavedChanges(); }
}

async function defaultIndexFactory(): Promise<AsyncIndex> {
  const mod = await import("@/lib/core/workerClient");
  const c = mod.createIndexClient();
  return {
    setAll: (files) => c.setAll([...files].map(([path, content]) => ({ path, content }))),
    upsert: (p, t) => c.upsert(p, t),
    remove: (p) => c.remove(p),
    rename: (a, b) => c.rename(a, b),
    setAttachments: (p) => c.setAttachments(p),
    search: (q, l) => c.search(q, l),
    quickSwitch: (q, l) => c.quickSwitch(q, l),
    backlinks: (p) => c.backlinks(p),
    parsed: (p) => c.parsed(p),
    allTags: () => c.allTags(),
    resolve: (t, f) => c.resolve(t, f),
    dispose: () => c.dispose(),
  };
}

/** Wraps a lazily created client; calls made before it is ready are awaited. */
function lazyIndex(factory: () => AsyncIndex | Promise<AsyncIndex>): AsyncIndex {
  let p: Promise<AsyncIndex> | null = null;
  const get = () => (p ??= Promise.resolve().then(factory));
  return {
    setAll: async (f) => (await get()).setAll(f),
    setAttachments: async (p) => (await get()).setAttachments?.(p),
    upsert: async (a, b) => (await get()).upsert(a, b),
    remove: async (a) => (await get()).remove(a),
    rename: async (a, b) => (await get()).rename(a, b),
    search: async (q, l) => (await get()).search(q, l),
    quickSwitch: async (q, l) => (await get()).quickSwitch(q, l),
    backlinks: async (a) => (await get()).backlinks(a),
    parsed: async (a) => (await get()).parsed(a),
    allTags: async () => (await get()).allTags(),
    resolve: async (a, b) => (await get()).resolve(a, b),
    dispose: () => { void p?.then((c) => c.dispose()); },
  };
}

let singleton: Vault | null = null;
export function getVault(): VaultService & { hasUnsavedChanges(): boolean } {
  return (singleton ??= new Vault());
}
export function hasUnsavedChanges(): boolean {
  return singleton?.hasUnsavedChanges() ?? false;
}
