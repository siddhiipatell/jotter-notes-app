import type { Backlink, ParsedNote, SearchHit } from "../types";
import type { IndexSink } from "../sync/engine";

/** Async index API (matches lib/core/workerClient createIndexClient()). */
export interface AsyncIndex {
  setAll(files: Map<string, string>): Promise<unknown> | unknown;
  setAttachments?(paths: string[]): Promise<unknown> | unknown;
  upsert(path: string, content: string): Promise<unknown> | unknown;
  remove(path: string): Promise<unknown> | unknown;
  rename(oldPath: string, newPath: string): Promise<unknown> | unknown;
  search(q: string, limit?: number): Promise<SearchHit[]>;
  quickSwitch(q: string, limit?: number): Promise<{ path: string; title: string }[]>;
  backlinks(path: string): Promise<Backlink[]>;
  parsed(path: string): Promise<ParsedNote | undefined>;
  allTags(): Promise<{ tag: string; count: number }[]>;
  resolve(target: string, fromPath: string): Promise<string | null>;
  dispose(): void;
}

/**
 * Main-thread mirror of the worker index so VaultService can expose synchronous reads.
 * A miss returns a fallback and fetches in the background; when the answer arrives the
 * cache is filled and an "index" event fires so the UI re-reads it.
 */
export class IndexMirror implements IndexSink {
  private cache = new Map<string, unknown>();
  private inflight = new Set<string>();
  private gen = 0;
  /** serialises mutations so the worker sees them in order */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private client: AsyncIndex, private onChange: () => void) {}

  private mutate(fn: () => Promise<unknown> | unknown, path?: string) {
    this.gen++;
    for (const k of [...this.cache.keys()]) if (k !== "p:" + path && !k.startsWith("p:")) this.cache.delete(k);
    if (path !== undefined) this.cache.delete("p:" + path);
    this.tail = this.tail.then(fn).catch(() => {}).then(() => {
      this.onChange();
      if (path !== undefined) this.memo("p:" + path, () => this.client.parsed(path), undefined);
    });
  }

  upsert(path: string, content: string) { this.mutate(() => this.client.upsert(path, content), path); }
  remove(path: string) {
    this.mutate(() => this.client.remove(path), path);
  }
  rename(oldPath: string, newPath: string) {
    this.cache.delete("p:" + oldPath);
    this.mutate(() => this.client.rename(oldPath, newPath), newPath);
  }
  setAll(files: Map<string, string>) {
    this.cache.clear();
    this.mutate(() => this.client.setAll(files));
    for (const p of files.keys()) this.cache.delete("p:" + p);
  }

  setAttachments(paths: string[]) {
    this.mutate(() => this.client.setAttachments?.(paths));
  }

  private memo<T>(key: string, fetcher: () => Promise<T>, fallback: T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    if (!this.inflight.has(key)) {
      this.inflight.add(key);
      const gen = this.gen;
      const run = async () => {
        try {
          await this.tail;
          const v = await fetcher();
          if (gen === this.gen) { this.cache.set(key, v); this.onChange(); }
          else { this.inflight.delete(key); this.memo(key, fetcher, fallback); return; }
        } catch { /* leave uncached; a later call retries */ }
        this.inflight.delete(key);
      };
      void run();
    }
    return fallback;
  }

  parsed(path: string) { return this.memo<ParsedNote | undefined>("p:" + path, () => this.client.parsed(path), undefined); }
  backlinks(path: string) { return this.memo<Backlink[]>("b:" + path, () => this.client.backlinks(path), []); }
  search(q: string, limit = 50) { return this.memo<SearchHit[]>(`s:${limit}:${q}`, () => this.client.search(q, limit), []); }
  quickSwitch(q: string, limit = 20) { return this.memo<{ path: string; title: string }[]>(`q:${limit}:${q}`, () => this.client.quickSwitch(q, limit), []); }
  allTags() { return this.memo<{ tag: string; count: number }[]>("tags", () => this.client.allTags(), []); }
  resolve(target: string, from: string) { return this.memo<string | null>(`r:${from}\u0000${target}`, () => this.client.resolve(target, from), null); }
  dispose() { this.client.dispose(); }
}
