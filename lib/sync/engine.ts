import { VaultDb, type AttachmentRecord } from "../storage/db";
import {
  VAULT_CONFIG_PATH, WrongPassphraseError,
  type CommitChange, type Conflict, type NoteRecord, type RepoRef, type SyncState, type TreeResponse, type VaultConfig,
} from "../types";
import { createVaultConfig, plainVaultConfig, unlockVault } from "@/lib/core/crypto";
import { threeWayMerge } from "@/lib/core/merge";
import { SyncApi, SyncApiError } from "./api";
import { base64ToBytes, bytesToBase64, fromUtf8, toArrayBuffer, utf8 } from "./bytes";
import { decAttachment, decText, encAttachment, encText, isEncryptedBytes, isEncryptedText } from "./crypt";

export interface IndexSink {
  upsert(path: string, content: string): void;
  remove(path: string): void;
  rename(oldPath: string, newPath: string): void;
  setAll(files: Map<string, string>): void;
}
export interface EngineOptions {
  api?: SyncApi;
  sink?: IndexSink;
  /** debounce after last edit before auto-push */
  pushDelayMs?: number;
  pollMs?: number;
  concurrency?: number;
  /** timers + focus/online listeners */
  auto?: boolean;
}

export const isNotePath = (p: string) => p.endsWith(".md");
/** Tracked = not inside/under a dotfile or dot-directory. */
export const isTracked = (p: string) => !p.split("/").some((s) => s.startsWith("."));
export const isAttachmentPath = (p: string) => isTracked(p) && !isNotePath(p);

const noopSink: IndexSink = { upsert() {}, remove() {}, rename() {}, setAll() {} };

export class SyncEngine {
  readonly api: SyncApi;
  private sink: IndexSink;
  private opt: Required<Omit<EngineOptions, "api" | "sink">>;
  private db: VaultDb | null = null;
  private repo: RepoRef | null = null;

  private notes = new Map<string, NoteRecord>();
  private atts = new Map<string, AttachmentRecord>();
  /** remote shas not yet fetched / applied locally */
  private incoming = new Map<string, string>();
  private conflictMap = new Map<string, Conflict>();
  private headSha: string | null = null;
  private config: VaultConfig | null = null;
  private configSha: string | null = null;
  private configDirty = false;
  private key: CryptoKey | null = null;
  private legacyKey: CryptoKey | null = null;
  private hydrated = false;
  private pendingTree: TreeResponse | null = null;

  private offline = false;
  private busy = false;
  private lastError: string | null = null;
  private lastSync: number | null = null;

  private listeners = new Map<string, Set<() => void>>();
  private chain: Promise<unknown> = Promise.resolve();
  private inflight = new Map<string, Promise<void>>();
  private urls = new Map<string, string>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private teardown: (() => void)[] = [];

  constructor(o: EngineOptions = {}) {
    this.api = o.api ?? new SyncApi();
    this.sink = o.sink ?? noopSink;
    this.opt = {
      pushDelayMs: o.pushDelayMs ?? 60_000,
      pollMs: o.pollMs ?? 45_000,
      concurrency: o.concurrency ?? 8,
      auto: o.auto ?? true,
    };
  }

  // ---------------- events ----------------
  subscribe(event: string, cb: () => void): () => void {
    let s = this.listeners.get(event);
    if (!s) this.listeners.set(event, (s = new Set()));
    s.add(cb);
    return () => { s!.delete(cb); };
  }
  private emit(event: string) {
    for (const cb of [...(this.listeners.get(event) ?? [])]) {
      try { cb(); } catch { /* listener errors must not break sync */ }
    }
  }

  // ---------------- lifecycle ----------------
  async open(repo: RepoRef): Promise<{ needsPassphrase: boolean; encrypted: boolean }> {
    await this.close();
    this.repo = repo;
    this.db = await VaultDb.open(repo);
    this.headSha = (await this.db.getMeta<string>("headSha")) ?? null;
    this.config = (await this.db.getMeta<VaultConfig>("config")) ?? null;
    this.configSha = (await this.db.getMeta<string>("configSha")) ?? null;
    this.configDirty = !!(await this.db.getMeta<boolean>("configDirty"));
    this.offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!this.config?.encryption) await this.hydrate();

    if (!this.offline) {
      try {
        const tree = await this.api.tree();
        await this.refreshConfig(tree);
        if (this.locked) this.pendingTree = tree;
        else {
          await this.hydrate();
          await this.applyTree(tree);
        }
      } catch (e) { this.handleError(e); }
    }
    if (!this.locked) this.afterReady();
    this.installAuto();
    this.emit("sync");
    return { needsPassphrase: this.locked, encrypted: !!this.config?.encryption };
  }

  async close(): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pushTimer = this.pollTimer = null;
    this.teardown.forEach((f) => f());
    this.teardown = [];
    await this.chain.catch(() => {});
    for (const u of this.urls.values()) URL.revokeObjectURL?.(u);
    this.urls.clear();
    this.db?.close();
    this.db = null;
    this.notes.clear(); this.atts.clear(); this.incoming.clear(); this.conflictMap.clear();
    this.key = this.legacyKey = null;
    this.hydrated = false;
    this.pendingTree = null;
    this.config = null; this.headSha = null;
  }

  private get locked(): boolean { return !!this.config?.encryption && !this.key; }
  get encrypted(): boolean { return !!this.config?.encryption; }

  private async hydrate() {
    if (this.hydrated || !this.db) return;
    for (const r of await this.db.allNotes()) this.notes.set(r.path, r);
    for (const r of await this.db.allAttachments()) this.atts.set(r.path, r);
    for (const [p, s] of Object.entries((await this.db.getMeta<Record<string, string>>("incoming")) ?? {})) this.incoming.set(p, s);
    for (const c of (await this.db.getMeta<Conflict[]>("conflicts")) ?? []) this.conflictMap.set(c.path, c);
    this.hydrated = true;
    this.sink.setAll(new Map([...this.notes].filter(([, r]) => !r.deleted).map(([p, r]) => [p, r.content])));
    this.emit("tree"); this.emit("conflict");
  }

  /** after unlock / open: resume background loading, schedule push for leftovers. */
  private afterReady() {
    void this.enqueue(() => this.drain()).catch((e) => this.handleError(e));
    if (this.hasUnsavedChanges()) this.schedulePush();
  }

  async unlock(passphrase: string): Promise<void> {
    if (!this.config?.encryption) return;
    try {
      this.key = await unlockVault(passphrase, this.config);
    } catch (e) {
      if (e instanceof WrongPassphraseError || (e as Error)?.name === "WrongPassphraseError") throw new WrongPassphraseError();
      throw e;
    }
    this.configSaltOfKey = this.config.encryption.saltB64;
    await this.hydrate();
    try {
      if (this.pendingTree) { const t = this.pendingTree; this.pendingTree = null; await this.applyTree(t); }
    } catch (e) { this.handleError(e); }
    this.afterReady();
    this.emit("sync");
  }

  private installAuto() {
    if (!this.opt.auto || typeof window === "undefined") return;
    this.pollTimer = setInterval(() => void this.pullNow().catch(() => {}), this.opt.pollMs);
    const onFocus = () => void this.pullNow().catch(() => {});
    const onOnline = () => { this.offline = false; this.emit("sync"); void this.pullNow().then(() => this.push()).catch(() => {}); };
    const onOffline = () => { this.offline = true; this.emit("sync"); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    this.teardown.push(() => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    });
  }

  // ---------------- persistence helpers ----------------
  private async persist(p: {
    notes?: string[]; atts?: string[]; meta?: ("headSha" | "config" | "configSha" | "configDirty" | "incoming" | "conflicts" | "lastSync")[];
  }) {
    if (!this.db) throw new Error("Vault is not open");
    const notes: NoteRecord[] = [], deleteNotes: string[] = [], attachments: AttachmentRecord[] = [], deleteAttachments: string[] = [];
    for (const path of p.notes ?? []) { const r = this.notes.get(path); r ? notes.push(r) : deleteNotes.push(path); }
    for (const path of p.atts ?? []) { const r = this.atts.get(path); r ? attachments.push(r) : deleteAttachments.push(path); }
    const meta: Record<string, unknown> = {};
    for (const k of p.meta ?? []) {
      meta[k] = k === "headSha" ? this.headSha : k === "config" ? this.config : k === "configSha" ? this.configSha
        : k === "configDirty" ? this.configDirty : k === "incoming" ? Object.fromEntries(this.incoming)
        : k === "conflicts" ? [...this.conflictMap.values()] : this.lastSync;
    }
    await this.db.commit({ notes, deleteNotes, attachments, deleteAttachments, meta });
  }

  // ---------------- reads ----------------
  listPaths(): string[] {
    if (this.locked) return [];
    const out = new Set<string>();
    for (const [p, r] of this.notes) if (!r.deleted) out.add(p);
    for (const [p, r] of this.atts) if (!r.deleted) out.add(p);
    for (const p of this.incoming.keys()) out.add(p);
    return [...out].sort();
  }
  unsyncedPaths(): Set<string> {
    const s = new Set<string>();
    for (const [p, r] of this.notes) if (r.dirty && !r.deleted) s.add(p);
    for (const [p, r] of this.atts) if (r.dirty && !r.deleted) s.add(p);
    return s;
  }
  noteContents(): Map<string, string> {
    return new Map([...this.notes].filter(([, r]) => !r.deleted).map(([p, r]) => [p, r.content]));
  }
  hasNote(path: string) { const r = this.notes.get(path); return (!!r && !r.deleted) || this.incoming.has(path); }

  async read(path: string): Promise<string | null> {
    if (this.locked) return null;
    let r = this.notes.get(path);
    if (!r && this.incoming.has(path) && isNotePath(path)) {
      await this.fetchIncoming(path);
      r = this.notes.get(path);
    }
    return r && !r.deleted ? r.content : null;
  }

  // ---------------- local mutations ----------------
  private requireOpen() {
    if (!this.db || !this.hydrated || this.locked) throw new Error("Vault is locked or not open");
  }
  private touched(path: string) { this.emit("note:" + path); this.emit("tree"); this.emit("sync"); this.schedulePush(); }

  async write(path: string, content: string): Promise<void> {
    this.requireOpen();
    if (!isNotePath(path)) throw new Error("Only .md notes can be written");
    await this.read(path); // make sure a not-yet-fetched note is merged first
    const r = this.notes.get(path);
    if (!r || r.deleted) throw new Error(`Note does not exist: ${path}`);
    if (r.content === content) return;
    r.content = content; r.dirty = true; r.updatedAt = Date.now();
    this.sink.upsert(path, content);
    await this.persist({ notes: [path] });
    this.touched(path);
  }

  async create(path: string, content = ""): Promise<void> {
    this.requireOpen();
    if (!isNotePath(path)) throw new Error("Notes must end in .md");
    if (this.hasNote(path)) throw new Error(`Already exists: ${path}`);
    this.putNew(path, content);
    this.sink.upsert(path, content);
    await this.persist({ notes: [path] });
    this.touched(path);
  }

  /** Create a record, inheriting the remote identity of a pending-delete marker (so it overwrites). */
  private putNew(path: string, content: string, renamedFrom?: string) {
    const old = this.notes.get(path);
    this.notes.set(path, {
      path, content, dirty: true, updatedAt: Date.now(),
      baseSha: old?.baseSha ?? null, baseContent: old?.baseContent ?? null,
      ...(renamedFrom ? { renamedFrom } : {}),
    });
  }

  async remove(path: string): Promise<void> {
    this.requireOpen();
    if (isNotePath(path)) {
      const r = this.notes.get(path);
      if (!r && !this.incoming.has(path)) return;
      if (!r) { this.incoming.delete(path); this.notes.set(path, this.tomb(path, this.incomingBase(path))); }
      else if (r.baseSha === null) this.notes.delete(path);
      else this.notes.set(path, this.tomb(path, r.baseSha, r.baseContent));
      this.conflictMap.delete(path);
      this.sink.remove(path);
      await this.persist({ notes: [path], meta: ["incoming", "conflicts"] });
    } else {
      const r = this.atts.get(path);
      const inc = this.incoming.get(path);
      if (!r && !inc) return;
      this.incoming.delete(path);
      const sha = r?.baseSha ?? inc ?? null;
      if (sha === null) this.atts.delete(path);
      else this.atts.set(path, { path, bytes: new ArrayBuffer(0), baseSha: sha, dirty: true, deleted: true, updatedAt: Date.now() });
      this.dropUrl(path);
      await this.persist({ atts: [path], meta: ["incoming"] });
    }
    this.emit("conflict");
    this.touched(path);
  }
  private incomingBase(path: string) { return this.incoming.get(path) ?? null; }
  private tomb(path: string, baseSha: string | null, baseContent: string | null = null): NoteRecord {
    return { path, content: "", baseSha, baseContent, dirty: true, deleted: true, updatedAt: Date.now() };
  }

  /** Move a note; `edits` are inbound-link rewrites (may include the moved file itself). */
  async renameNote(oldPath: string, newPath: string, edits: Map<string, string>): Promise<string[]> {
    this.requireOpen();
    if (oldPath === newPath) return [];
    await this.read(oldPath);
    const old = this.notes.get(oldPath);
    if (!old || old.deleted) throw new Error(`Note does not exist: ${oldPath}`);
    if (this.hasNote(newPath)) throw new Error(`Already exists: ${newPath}`);
    const touched: string[] = [];
    for (const [p, content] of edits) {
      if (p === oldPath) continue;
      const r = this.notes.get(p);
      if (!r || r.deleted || r.content === content) continue;
      r.content = content; r.dirty = true; r.updatedAt = Date.now();
      touched.push(p);
      this.sink.upsert(p, content);
    }
    const movedContent = edits.get(oldPath) ?? old.content;
    if (edits.has(oldPath) && edits.get(oldPath) !== old.content) touched.push(newPath);
    const conflict = this.conflictMap.get(oldPath);
    this.conflictMap.delete(oldPath);
    if (old.baseSha === null) this.notes.delete(oldPath);
    else this.notes.set(oldPath, this.tomb(oldPath, old.baseSha, old.baseContent));
    this.putNew(newPath, movedContent, oldPath);
    if (conflict) this.conflictMap.set(newPath, { ...conflict, path: newPath });
    this.sink.rename(oldPath, newPath);
    if (movedContent !== old.content) this.sink.upsert(newPath, movedContent);
    await this.persist({ notes: [oldPath, newPath, ...touched.filter((p) => p !== newPath)], meta: ["conflicts"] });
    for (const p of touched) this.emit("note:" + p);
    this.emit("note:" + oldPath);
    this.emit("conflict");
    this.touched(newPath);
    return touched;
  }

  async addAttachment(path: string, bytes: ArrayBuffer): Promise<void> {
    this.requireOpen();
    if (!isAttachmentPath(path)) throw new Error("Not a valid attachment path");
    const old = this.atts.get(path);
    this.atts.set(path, {
      path, bytes: bytes.slice(0), baseSha: old?.baseSha ?? this.incoming.get(path) ?? null,
      dirty: true, updatedAt: Date.now(),
    });
    this.incoming.delete(path);
    this.dropUrl(path);
    await this.persist({ atts: [path], meta: ["incoming"] });
    this.touched(path);
  }

  async readAttachmentUrl(path: string): Promise<string | null> {
    if (this.locked) return null;
    const cached = this.urls.get(path);
    if (cached) return cached;
    if (!this.atts.has(path) && this.incoming.has(path)) await this.fetchIncoming(path);
    const r = this.atts.get(path);
    if (!r || r.deleted) return null;
    const url = URL.createObjectURL(new Blob([r.bytes]));
    this.urls.set(path, url);
    return url;
  }
  private dropUrl(path: string) {
    const u = this.urls.get(path);
    if (u) { URL.revokeObjectURL?.(u); this.urls.delete(path); }
  }

  // ---------------- conflicts ----------------
  conflicts(): Conflict[] { return [...this.conflictMap.values()]; }

  async resolveConflict(path: string, resolution: "mine" | "theirs" | string): Promise<void> {
    this.requireOpen();
    const c = this.conflictMap.get(path);
    const r = this.notes.get(path);
    if (!c || !r) return;
    const content = resolution === "mine" ? c.mine : resolution === "theirs" ? c.theirs : resolution;
    r.baseSha = c.theirsSha;
    r.baseContent = c.theirsSha === null ? null : c.theirs;
    r.content = content;
    r.dirty = c.theirsSha === null ? true : content !== c.theirs;
    r.deleted = false;
    r.updatedAt = Date.now();
    this.conflictMap.delete(path);
    this.sink.upsert(path, content);
    await this.persist({ notes: [path], meta: ["conflicts"] });
    this.emit("conflict");
    this.touched(path);
  }

  // ---------------- state ----------------
  hasUnsavedChanges(): boolean {
    if (this.configDirty) return true;
    for (const r of this.notes.values()) if (r.dirty) return true;
    for (const r of this.atts.values()) if (r.dirty) return true;
    return false;
  }
  private dirtyCount(): number {
    let n = 0;
    for (const r of this.notes.values()) if (r.dirty) n++;
    for (const r of this.atts.values()) if (r.dirty) n++;
    return n + (this.configDirty ? 1 : 0);
  }
  syncState(): SyncState {
    if (this.busy) return { kind: "syncing" };
    if (this.offline) return { kind: "offline" };
    if (this.locked && this.config) return { kind: "error", message: "Vault is locked" };
    if (this.lastError) return { kind: "error", message: this.lastError };
    if (this.conflictMap.size) return { kind: "conflict", count: this.conflictMap.size };
    const n = this.dirtyCount();
    return n ? { kind: "unsynced", count: n } : { kind: "synced" };
  }
  lastSyncedAt() { return this.lastSync; }

  private handleError(e: unknown) {
    if (e instanceof SyncApiError && e.code === "offline") { this.offline = true; this.lastError = null; }
    else { this.lastError = e instanceof Error ? e.message : String(e); }
    this.emit("sync");
  }
  private clearError() { this.offline = false; this.lastError = null; }

  // ---------------- serialisation ----------------
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      this.busy = true; this.emit("sync");
      try { return await fn(); } finally { this.busy = false; this.emit("sync"); }
    });
    this.chain = run.catch(() => {});
    return run;
  }

  // ---------------- pull ----------------
  pullNow(): Promise<void> {
    if (!this.db || this.locked) return Promise.resolve();
    return this.enqueue(() => this.pull()).catch((e) => { this.handleError(e); });
  }

  private async pull(): Promise<void> {
    const head = await this.api.head();
    this.clearError();
    if (head.headSha === this.headSha && this.incoming.size === 0) { this.lastSync = Date.now(); return; }
    if (head.headSha !== this.headSha) {
      const tree = await this.api.tree();
      await this.refreshConfig(tree);
      if (this.locked) { this.pendingTree = tree; return; }
      await this.applyTree(tree);
    }
    await this.drain();
    this.lastSync = Date.now();
    await this.persist({ meta: ["lastSync"] });
  }

  private async refreshConfig(tree: TreeResponse) {
    const e = tree.entries.find((x) => x.path === VAULT_CONFIG_PATH);
    if (!e || e.sha === this.configSha || this.configDirty) return;
    const cfg = JSON.parse(fromUtf8(base64ToBytes(await this.api.blob(e.sha)))) as VaultConfig;
    this.config = cfg;
    this.configSha = e.sha;
    if (this.key && cfg.encryption?.saltB64 !== this.configSaltOfKey) this.key = null;
    if (!cfg.encryption) this.key = null;
    await this.db!.commit({ meta: { config: cfg, configSha: e.sha } });
    this.emit("sync");
  }
  private configSaltOfKey: string | null = null;

  /** Diff the remote tree against local shas; records incoming work, handles remote deletes. */
  private async applyTree(tree: TreeResponse) {
    const remote = new Map<string, string>();
    for (const e of tree.entries) if (isTracked(e.path)) remote.set(e.path, e.sha);
    const touchedNotes: string[] = [], touchedAtts: string[] = [];
    const changedPaths: string[] = [];

    for (const [path, sha] of remote) {
      const isNote = isNotePath(path);
      const base = isNote ? this.notes.get(path)?.baseSha : this.atts.get(path)?.baseSha;
      const local = isNote ? this.notes.has(path) : this.atts.has(path);
      if (local && base === sha) { this.incoming.delete(path); continue; }
      this.incoming.set(path, sha);
    }
    for (const path of [...this.incoming.keys()]) if (!remote.has(path)) this.incoming.delete(path);

    for (const [path, r] of [...this.notes]) {
      if (r.baseSha === null || remote.has(path)) continue;
      // deleted remotely
      if (r.deleted) this.notes.delete(path);
      else if (r.dirty) { r.baseSha = null; r.baseContent = null; r.renamedFrom = undefined; }
      else { this.notes.delete(path); this.sink.remove(path); }
      this.conflictMap.delete(path);
      touchedNotes.push(path); changedPaths.push(path);
    }
    for (const [path, r] of [...this.atts]) {
      if (r.baseSha === null || remote.has(path)) continue;
      if (r.deleted) this.atts.delete(path);
      else if (r.dirty) r.baseSha = null;
      else { this.atts.delete(path); this.dropUrl(path); }
      touchedAtts.push(path); changedPaths.push(path);
    }
    this.headSha = tree.headSha;
    await this.persist({ notes: touchedNotes, atts: touchedAtts, meta: ["headSha", "incoming", "conflicts"] });
    this.emit("tree"); this.emit("conflict");
    for (const p of changedPaths) this.emit("note:" + p);
  }

  /** Fetch every incoming note (and attachments we already hold), concurrency-bounded, progressive. */
  private async drain(includeNewAttachments = false) {
    const wanted = () => [...this.incoming.keys()].filter((p) => isNotePath(p) || this.atts.has(p) || includeNewAttachments);
    let paths = wanted();
    while (paths.length) {
      for (let i = 0; i < paths.length; i += this.opt.concurrency) {
        const chunk = paths.slice(i, i + this.opt.concurrency);
        await Promise.all(chunk.map((p) => this.fetchIncoming(p)));
        this.emit("tree");
      }
      paths = wanted();
    }
  }

  private fetchIncoming(path: string): Promise<void> {
    const existing = this.inflight.get(path);
    if (existing) return existing;
    const p = this.doFetchIncoming(path).finally(() => this.inflight.delete(path));
    this.inflight.set(path, p);
    return p;
  }

  private async doFetchIncoming(path: string): Promise<void> {
    const sha = this.incoming.get(path);
    if (!sha) return;
    const raw = base64ToBytes(await this.api.blob(sha));
    if (this.incoming.get(path) !== sha) return; // superseded while fetching
    if (isNotePath(path)) {
      let text = fromUtf8(raw);
      if (isEncryptedText(text)) {
        const k = this.key ?? this.legacyKey;
        if (!k) throw new Error("Vault is locked");
        text = await decText(k, text);
      }
      this.applyRemoteNote(path, text, sha);
      this.incoming.delete(path);
      await this.persist({ notes: [path], meta: ["incoming", "conflicts"] });
    } else {
      let bytes = raw;
      if (isEncryptedBytes(raw)) {
        const k = this.key ?? this.legacyKey;
        if (!k) throw new Error("Vault is locked");
        bytes = await decAttachment(k, raw);
      }
      const local = this.atts.get(path);
      if (local?.dirty) local.baseSha = sha; // local binary wins; overwritten on next push
      else this.atts.set(path, { path, bytes: toArrayBuffer(bytes), baseSha: sha, dirty: false, updatedAt: Date.now() });
      this.dropUrl(path);
      this.incoming.delete(path);
      await this.persist({ atts: [path], meta: ["incoming"] });
    }
    this.emit("note:" + path);
  }

  private applyRemoteNote(path: string, theirs: string, sha: string) {
    const r = this.notes.get(path);
    if (!r) {
      this.notes.set(path, { path, content: theirs, baseSha: sha, baseContent: theirs, dirty: false, updatedAt: Date.now() });
      this.sink.upsert(path, theirs);
    } else if (r.deleted) {
      if (r.baseSha === sha) return;
      // remote edited what we deleted: keep the remote version (nothing lost)
      this.notes.set(path, { path, content: theirs, baseSha: sha, baseContent: theirs, dirty: false, updatedAt: Date.now() });
      this.sink.upsert(path, theirs);
    } else if (!r.dirty) {
      r.content = theirs; r.baseSha = sha; r.baseContent = theirs; r.updatedAt = Date.now();
      this.sink.upsert(path, theirs);
    } else if (r.content === theirs) {
      r.baseSha = sha; r.baseContent = theirs; r.dirty = false;
    } else {
      const { merged, conflict } = threeWayMerge(r.baseContent, r.content, theirs);
      if (!conflict) {
        r.content = merged; r.baseSha = sha; r.baseContent = theirs; r.dirty = merged !== theirs; r.updatedAt = Date.now();
        this.sink.upsert(path, merged);
      } else {
        this.conflictMap.set(path, { path, mine: r.content, theirs, theirsSha: sha, base: r.baseContent });
        this.emit("conflict");
      }
    }
  }

  // ---------------- push ----------------
  schedulePush() {
    if (!this.opt.auto) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.pushNow().catch(() => {}), this.opt.pushDelayMs);
  }

  pushNow(): Promise<void> {
    if (!this.db || this.locked) return Promise.resolve();
    if (this.pushTimer) { clearTimeout(this.pushTimer); this.pushTimer = null; }
    return this.enqueue(() => this.push()).catch((e) => { this.handleError(e); });
  }
  private async push(retried = false): Promise<void> {
    if (!this.hasUnsavedChanges()) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (this.incoming.size) await this.drain(); // never overwrite remote versions we have not merged
    const k = this.key;
    const changes: CommitChange[] = [];
    const sent = new Map<string, { kind: "note" | "att"; text?: string; bytes?: ArrayBuffer; deleted: boolean }>();
    for (const [path, r] of this.notes) {
      if (!r.dirty || this.conflictMap.has(path)) continue;
      if (r.deleted) { changes.push({ path, contentBase64: null }); sent.set(path, { kind: "note", deleted: true }); continue; }
      const body = k ? await encText(k, r.content) : r.content;
      changes.push({ path, contentBase64: bytesToBase64(utf8(body)) });
      sent.set(path, { kind: "note", text: r.content, deleted: false });
    }
    for (const [path, r] of this.atts) {
      if (!r.dirty) continue;
      if (r.deleted) { changes.push({ path, contentBase64: null }); sent.set(path, { kind: "att", deleted: true }); continue; }
      const raw = new Uint8Array(r.bytes);
      changes.push({ path, contentBase64: bytesToBase64(k ? await encAttachment(k, raw) : raw) });
      sent.set(path, { kind: "att", bytes: r.bytes, deleted: false });
    }
    const configSent = this.configDirty && this.config ? this.config : null;
    if (configSent) changes.push({ path: VAULT_CONFIG_PATH, contentBase64: bytesToBase64(utf8(JSON.stringify(configSent, null, 2) + "\n")) });
    if (!changes.length) return;

    let res;
    try {
      res = await this.api.commit({ baseSha: this.headSha ?? "", message: commitMessage(changes), changes });
    } catch (e) {
      if (e instanceof SyncApiError && e.code === "stale" && !retried) {
        await this.pull();
        return this.push(true);
      }
      throw e;
    }
    this.clearError();
    const shas = new Map(res.entries.map((e) => [e.path, e.sha]));
    const noteP: string[] = [], attP: string[] = [];
    for (const [path, s] of sent) {
      const sha = shas.get(path) ?? null;
      if (s.kind === "note") {
        const r = this.notes.get(path);
        if (!r) continue;
        noteP.push(path);
        if (s.deleted) {
          if (r.deleted) this.notes.delete(path);
          else { r.baseSha = null; r.baseContent = null; } // recreated meanwhile
        } else if (r.deleted) {
          r.baseSha = sha; r.baseContent = s.text!; // deleted while pushing; delete stays pending
        } else {
          r.baseSha = sha; r.baseContent = s.text!; r.renamedFrom = undefined;
          r.dirty = r.content !== s.text || !sha;
        }
      } else {
        const r = this.atts.get(path);
        if (!r) continue;
        attP.push(path);
        if (s.deleted) { if (r.deleted) this.atts.delete(path); else r.baseSha = null; }
        else { r.baseSha = sha; r.dirty = r.bytes !== s.bytes; }
      }
    }
    if (configSent) {
      this.configSha = shas.get(VAULT_CONFIG_PATH) ?? this.configSha;
      if (this.config === configSent) this.configDirty = false;
    }
    this.headSha = res.headSha;
    if (!this.hasUnsavedChanges()) this.legacyKey = null;
    this.lastSync = Date.now();
    await this.persist({ notes: noteP, atts: attP, meta: ["headSha", "config", "configSha", "configDirty", "lastSync"] });
    this.emit("tree");
    for (const p of noteP) this.emit("note:" + p);
    if (this.hasUnsavedChanges()) this.schedulePush();
  }

  // ---------------- encryption ----------------
  private async loadEverything() {
    if (this.offline && this.incoming.size) throw new Error("Go online to change encryption (files still need downloading)");
    await this.enqueue(() => this.drain(true));
  }
  private async markAllDirty() {
    for (const r of this.notes.values()) if (!r.deleted) r.dirty = true;
    for (const r of this.atts.values()) if (!r.deleted) r.dirty = true;
    this.configDirty = true;
    await this.persist({ notes: [...this.notes.keys()], atts: [...this.atts.keys()], meta: ["config", "configDirty"] });
  }

  async enableEncryption(passphrase: string): Promise<void> {
    this.requireOpen();
    if (this.config?.encryption) throw new Error("Encryption is already enabled");
    await this.loadEverything();
    const { config, key } = await createVaultConfig(passphrase);
    this.config = config; this.key = key;
    this.configSaltOfKey = config.encryption!.saltB64;
    await this.markAllDirty();
    this.emit("sync");
    this.schedulePush();
  }

  async disableEncryption(): Promise<void> {
    this.requireOpen();
    if (!this.config?.encryption) return;
    await this.loadEverything();
    this.legacyKey = this.key; // still needed to read remote files until the plaintext push lands
    this.config = plainVaultConfig(); this.key = null;
    await this.markAllDirty();
    this.emit("sync");
    this.schedulePush();
  }
}

export function commitMessage(changes: CommitChange[]): string {
  const files = changes.filter((c) => c.path !== VAULT_CONFIG_PATH);
  const name = (p: string) => p.replace(/^.*\//, "").replace(/\.md$/, "");
  if (files.length === 0) return "Update vault settings";
  if (files.length === 1) {
    const c = files[0];
    return `${c.contentBase64 === null ? "Delete" : "Update"} ${name(c.path)}`;
  }
  return `Update ${files.length} notes`;
}
