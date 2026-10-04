/**
 * Shared contracts. Every module codes against these. If you must change one,
 * keep it backwards compatible and note the change in docs/CONTRACTS.md.
 */

// ---------- GitHub broker API (server <-> client) ----------
export interface SessionInfo {
  user: { login: string; name: string | null; avatarUrl: string } | null;
  repo: RepoRef | null;
}
export interface RepoRef { owner: string; name: string; branch: string }
export interface RepoSummary extends RepoRef { private: boolean }
export interface TreeEntry { path: string; sha: string; size: number }
export interface TreeResponse { headSha: string; entries: TreeEntry[]; truncated: boolean }
export interface CommitChange {
  path: string;
  /** base64 file bytes; null deletes the path */
  contentBase64: string | null;
}
export interface CommitRequest { baseSha: string; message: string; changes: CommitChange[] }
export interface CommitResponse { headSha: string; entries: { path: string; sha: string }[] }
export interface ApiError { code: "unauthenticated" | "no_repo" | "stale" | "rate_limited" | "not_found" | "bad_request" | "upstream"; message: string }

// ---------- Vault / encryption config (stored in repo at .jotter/config.json, plaintext) ----------
export const VAULT_CONFIG_PATH = ".jotter/config.json";
export interface VaultConfig {
  version: 1;
  encryption: null | {
    kdf: "PBKDF2-SHA256";
    iterations: number;
    saltB64: string;
    /** armored encryption of a known string, to verify the passphrase */
    checkB64: string;
  };
}

// ---------- Core (pure, worker-safe, no DOM/React) ----------
export interface WikiLink {
  raw: string; target: string; heading?: string; block?: string; alias?: string;
  embed: boolean; start: number; end: number; line: number;
}
export interface Heading { level: number; text: string; line: number }
export interface ParsedNote {
  path: string;
  title: string;                       // filename without .md
  frontmatter: Record<string, unknown>;
  links: WikiLink[];
  tags: string[];                      // without '#', includes frontmatter tags, nested a/b kept
  headings: Heading[];
  wordCount: number;
}
export interface SearchHit { path: string; title: string; score: number; snippet: string; line?: number }
export interface Backlink { fromPath: string; fromTitle: string; line: number; context: string }

// ---------- Local store (IndexedDB) ----------
export interface NoteRecord {
  path: string;
  /** plaintext working copy */
  content: string;
  /** remote blob sha at last successful sync; null if never pushed */
  baseSha: string | null;
  /** plaintext of the remote version at baseSha (for 3-way merge); null if new */
  baseContent: string | null;
  dirty: boolean;
  /** true => pending delete on push */
  deleted?: boolean;
  /** if set, path is pending rename from this old path */
  renamedFrom?: string;
  updatedAt: number;
}
export interface Conflict { path: string; mine: string; theirs: string; theirsSha: string | null; base: string | null }

export type SyncState =
  | { kind: "synced" }
  | { kind: "unsynced"; count: number }
  | { kind: "syncing" }
  | { kind: "offline" }
  | { kind: "conflict"; count: number }
  | { kind: "error"; message: string };

export interface FileNode { path: string; name: string; type: "file" | "folder"; children?: FileNode[]; unsynced?: boolean }

/**
 * The facade the UI uses. Implemented in lib/vault/index.ts (getVault()).
 * All methods are safe to call from the main thread; heavy work happens in workers.
 */
export interface VaultService {
  // lifecycle
  open(repo: RepoRef): Promise<{ needsPassphrase: boolean; encrypted: boolean }>;
  unlock(passphrase: string): Promise<void>;                    // throws WrongPassphraseError
  enableEncryption(passphrase: string): Promise<void>;          // re-encrypts all files on next push
  disableEncryption(): Promise<void>;
  close(): Promise<void>;
  // notes
  listPaths(): string[];
  tree(): FileNode[];
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;          // persists to IndexedDB before resolving
  create(path: string, content?: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<{ updatedPaths: string[] }>; // rewrites inbound links
  remove(path: string): Promise<void>;
  addAttachment(path: string, bytes: ArrayBuffer): Promise<void>;
  readAttachmentUrl(path: string): Promise<string | null>;      // object URL
  // derived data
  parsed(path: string): ParsedNote | undefined;
  backlinks(path: string): Backlink[];
  resolve(target: string, fromPath: string): string | null;
  search(query: string, limit?: number): SearchHit[];
  quickSwitch(query: string, limit?: number): { path: string; title: string }[];
  allTags(): { tag: string; count: number }[];
  // sync
  syncState(): SyncState;
  pushNow(): Promise<void>;
  pullNow(): Promise<void>;
  conflicts(): Conflict[];
  resolveConflict(path: string, resolution: "mine" | "theirs" | string): Promise<void>; // string = merged text
  // events: returns unsubscribe. Events: "tree" | "note:<path>" | "sync" | "index" | "conflict"
  subscribe(event: string, cb: () => void): () => void;
}

export class WrongPassphraseError extends Error {
  constructor() { super("Wrong passphrase"); this.name = "WrongPassphraseError"; }
}
