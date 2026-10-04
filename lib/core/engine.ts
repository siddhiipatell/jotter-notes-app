import type { Backlink, ParsedNote, SearchHit } from "../types";
import { aliasMap, buildBacklinks, createResolver, unresolvedLinks, type Resolver } from "./links";
import { parseNote } from "./markdown";
import { SearchIndex } from "./search";

export interface IndexFile { path: string; content: string }

/**
 * Owns the search index, parsed notes and backlinks. Pure and synchronous; the Web Worker
 * (workers/index.worker.ts) simply wraps one of these, and the client falls back to running
 * one in-thread where Workers are unavailable.
 */
export class IndexEngine {
  private contents = new Map<string, string>();
  private parsedMap = new Map<string, ParsedNote>();
  private search_ = new SearchIndex();
  private attachments: string[] = [];
  private backlinkCache: Map<string, Backlink[]> | null = null;
  private resolver: Resolver | null = null;

  private invalidate() {
    this.backlinkCache = null;
    this.resolver = null;
  }

  /** Replace everything. `attachmentPaths` are non-note files used when resolving embeds. */
  setAll(files: IndexFile[], attachmentPaths: string[] = []): ParsedNote[] {
    this.contents.clear();
    this.parsedMap.clear();
    this.search_.clear();
    this.attachments = attachmentPaths;
    for (const f of files) this.add(f.path, f.content);
    this.invalidate();
    return [...this.parsedMap.values()];
  }

  private add(path: string, content: string): ParsedNote {
    const p = parseNote(path, content);
    this.contents.set(path, content);
    this.parsedMap.set(path, p);
    this.search_.upsert(path, content, p);
    return p;
  }

  upsert(path: string, content: string): ParsedNote {
    const p = this.add(path, content);
    this.invalidate();
    return p;
  }

  remove(path: string): void {
    this.contents.delete(path);
    this.parsedMap.delete(path);
    this.search_.remove(path);
    this.invalidate();
  }

  rename(oldPath: string, newPath: string): ParsedNote | null {
    const content = this.contents.get(oldPath);
    if (content === undefined) return null;
    this.remove(oldPath);
    return this.upsert(newPath, content);
  }

  setAttachments(paths: string[]): void {
    this.attachments = paths;
    this.resolver = null;
  }

  search(query: string, limit = 50): SearchHit[] { return this.search_.search(query, limit); }
  quickSwitch(query: string, limit = 20): { path: string; title: string }[] { return this.search_.quickSwitch(query, limit); }
  allTags(): { tag: string; count: number }[] { return this.search_.allTags(); }
  parsed(path: string): ParsedNote | undefined { return this.parsedMap.get(path); }
  paths(): string[] { return [...this.parsedMap.keys()]; }

  backlinks(path: string): Backlink[] {
    if (!this.backlinkCache) this.backlinkCache = buildBacklinks([...this.parsedMap.values()], this.contents);
    return this.backlinkCache.get(path) ?? [];
  }

  unresolved(): [string, Backlink[]][] {
    return [...unresolvedLinks([...this.parsedMap.values()], this.contents, this.attachments)];
  }

  resolve(target: string, fromPath: string): string | null {
    if (!this.resolver) this.resolver = createResolver([...this.parsedMap.keys(), ...this.attachments], aliasMap(this.parsedMap.values()));
    return this.resolver(target, fromPath);
  }
}

export const ENGINE_METHODS = [
  "setAll", "upsert", "remove", "rename", "setAttachments", "search", "quickSwitch",
  "allTags", "parsed", "paths", "backlinks", "unresolved", "resolve",
] as const;
export type EngineMethod = (typeof ENGINE_METHODS)[number];

export interface RpcRequest { id: number; method: EngineMethod; args: unknown[] }
export interface RpcResponse { id: number; result?: unknown; error?: string }

export function handleRpc(engine: IndexEngine, req: RpcRequest): RpcResponse {
  try {
    if (!(ENGINE_METHODS as readonly string[]).includes(req.method)) throw new Error(`Unknown method ${req.method}`);
    const fn = engine[req.method] as (...a: unknown[]) => unknown;
    return { id: req.id, result: fn.apply(engine, req.args) };
  } catch (e) {
    return { id: req.id, error: e instanceof Error ? e.message : String(e) };
  }
}
