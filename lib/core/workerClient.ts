import type { Backlink, ParsedNote, SearchHit } from "../types";
import { handleRpc, IndexEngine, type EngineMethod, type IndexFile, type RpcRequest, type RpcResponse } from "./engine";

export interface IndexClient {
  /** Replace the whole index. `attachmentPaths` lets embeds like ![[img.png]] resolve. */
  setAll(files: IndexFile[], attachmentPaths?: string[]): Promise<void>;
  upsert(path: string, content: string): Promise<ParsedNote>;
  remove(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  setAttachments(paths: string[]): Promise<void>;
  search(query: string, limit?: number): Promise<SearchHit[]>;
  quickSwitch(query: string, limit?: number): Promise<{ path: string; title: string }[]>;
  backlinks(path: string): Promise<Backlink[]>;
  parsed(path: string): Promise<ParsedNote | undefined>;
  allTags(): Promise<{ tag: string; count: number }[]>;
  resolve(target: string, fromPath: string): Promise<string | null>;
  unresolved(): Promise<[string, Backlink[]][]>;
  dispose(): void;
  /** true when running in a real Web Worker, false for the in-thread fallback */
  readonly usesWorker: boolean;
  /**
   * Synchronous reads of the last known results, for UI code that cannot await.
   * - `parsed(path)`: always up to date after the mutating promise (setAll/upsert/remove/rename) resolves.
   * - `backlinks(path)`, `search(query)`, `allTags()`: the last value returned by the async call
   *   with the same argument (undefined/[] if never asked). Mutations mark them stale; call the async
   *   method again (or listen with `onUpdate`) to refresh.
   */
  cache: {
    parsed(path: string): ParsedNote | undefined;
    allParsed(): ParsedNote[];
    backlinks(path: string): Backlink[];
    search(query: string): SearchHit[];
    allTags(): { tag: string; count: number }[];
  };
  /** Called after every mutation or refreshed query result. Returns unsubscribe. */
  onUpdate(cb: () => void): () => void;
}

type Transport = (method: EngineMethod, args: unknown[]) => Promise<unknown>;

function workerAvailable(): boolean {
  return typeof Worker !== "undefined";
}

function makeTransport(forceInThread: boolean): { call: Transport; dispose(): void; usesWorker: boolean } {
  if (!forceInThread && workerAvailable()) {
    try {
      const worker = new Worker(new URL("../../workers/index.worker.ts", import.meta.url), { type: "module" });
      let nextId = 1;
      const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
      worker.onmessage = (e: MessageEvent<RpcResponse>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.error !== undefined) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
      };
      worker.onerror = (e) => {
        const err = new Error(e.message || "Index worker crashed");
        for (const p of pending.values()) p.reject(err);
        pending.clear();
      };
      return {
        usesWorker: true,
        call: (method, args) =>
          new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            const req: RpcRequest = { id, method, args };
            worker.postMessage(req);
          }),
        dispose: () => {
          worker.terminate();
          const err = new Error("Index client disposed");
          for (const p of pending.values()) p.reject(err);
          pending.clear();
        },
      };
    } catch {
      /* fall through to in-thread */
    }
  }
  const engine = new IndexEngine();
  let nextId = 1;
  return {
    usesWorker: false,
    call: (method, args) =>
      Promise.resolve().then(() => {
        const res = handleRpc(engine, { id: nextId++, method, args });
        if (res.error !== undefined) throw new Error(res.error);
        return res.result;
      }),
    dispose: () => {},
  };
}

export function createIndexClient(opts: { forceInThread?: boolean } = {}): IndexClient {
  const t = makeTransport(!!opts.forceInThread);
  const parsedCache = new Map<string, ParsedNote>();
  let backlinkCache = new Map<string, Backlink[]>();
  let searchCache = new Map<string, SearchHit[]>();
  let tagsCache: { tag: string; count: number }[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((cb) => cb());
  const stale = () => { backlinkCache = new Map(); searchCache = new Map(); };

  const call = <T>(m: EngineMethod, ...args: unknown[]) => t.call(m, args) as Promise<T>;

  return {
    usesWorker: t.usesWorker,
    async setAll(files, attachmentPaths = []) {
      const all = await call<ParsedNote[]>("setAll", files, attachmentPaths);
      parsedCache.clear();
      for (const p of all) parsedCache.set(p.path, p);
      stale();
      emit();
    },
    async upsert(path, content) {
      const p = await call<ParsedNote>("upsert", path, content);
      parsedCache.set(path, p);
      stale();
      emit();
      return p;
    },
    async remove(path) {
      await call("remove", path);
      parsedCache.delete(path);
      stale();
      emit();
    },
    async rename(oldPath, newPath) {
      const p = await call<ParsedNote | null>("rename", oldPath, newPath);
      parsedCache.delete(oldPath);
      if (p) parsedCache.set(newPath, p);
      stale();
      emit();
    },
    async setAttachments(paths) { await call("setAttachments", paths); stale(); },
    async search(query, limit) {
      const hits = await call<SearchHit[]>("search", query, limit);
      searchCache.set(query, hits);
      return hits;
    },
    quickSwitch: (query, limit) => call("quickSwitch", query, limit),
    async backlinks(path) {
      const bl = await call<Backlink[]>("backlinks", path);
      backlinkCache.set(path, bl);
      emit();
      return bl;
    },
    parsed: (path) => call("parsed", path),
    async allTags() {
      tagsCache = await call("allTags");
      return tagsCache;
    },
    resolve: (target, fromPath) => call("resolve", target, fromPath),
    unresolved: () => call("unresolved"),
    dispose: () => { t.dispose(); listeners.clear(); },
    cache: {
      parsed: (p) => parsedCache.get(p),
      allParsed: () => [...parsedCache.values()],
      backlinks: (p) => backlinkCache.get(p) ?? [],
      search: (q) => searchCache.get(q) ?? [],
      allTags: () => tagsCache,
    },
    onUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
