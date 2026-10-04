import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { vi } from "vitest";
import { Vault } from "@/lib/vault";
import { SyncApi } from "@/lib/sync/api";
import type { AsyncIndex } from "@/lib/vault/indexMirror";
import type { CommitRequest, RepoRef } from "@/lib/types";

export class FakeGithub {
  files = new Map<string, Buffer>();
  blobs = new Map<string, Buffer>();
  n = 0;
  head = "c0";
  commits: CommitRequest[] = [];
  /** called right before a commit is evaluated */
  beforeCommit: (() => void) | null = null;
  fail: { status: number; times: number } | null = null;
  requests: string[] = [];

  sha(b: Buffer) { return createHash("sha1").update(b).digest("hex"); }
  set(path: string, content: string | Buffer) {
    const b = Buffer.from(content);
    this.blobs.set(this.sha(b), b);
    this.files.set(path, b);
    this.head = "c" + ++this.n;
  }
  text(path: string) { return this.files.get(path)?.toString("utf8"); }

  install() {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = new URL(url, "http://x");
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      this.requests.push(`${init?.method ?? "GET"} ${u.pathname}`);
      if (this.fail && this.fail.times > 0) { this.fail.times--; return json(this.fail.status, { code: "upstream", message: "boom" }); }
      if (u.pathname === "/api/github/head") return json(200, { headSha: this.head });
      if (u.pathname === "/api/github/tree") {
        return json(200, {
          headSha: this.head, truncated: false,
          entries: [...this.files].map(([path, b]) => ({ path, sha: this.sha(b), size: b.length })),
        });
      }
      if (u.pathname === "/api/github/blob") {
        const b = this.blobs.get(u.searchParams.get("sha")!);
        return b ? json(200, { contentBase64: b.toString("base64") }) : json(404, { code: "not_found", message: "no" });
      }
      if (u.pathname === "/api/github/commit") {
        this.beforeCommit?.();
        const req = JSON.parse(init!.body as string) as CommitRequest;
        if (req.baseSha !== this.head) return json(409, { code: "stale", message: "stale" });
        this.commits.push(req);
        const entries: { path: string; sha: string }[] = [];
        for (const c of req.changes) {
          if (c.contentBase64 === null) this.files.delete(c.path);
          else {
            const b = Buffer.from(c.contentBase64, "base64");
            this.blobs.set(this.sha(b), b);
            this.files.set(c.path, b);
            entries.push({ path: c.path, sha: this.sha(b) });
          }
        }
        this.head = "c" + ++this.n;
        return json(200, { headSha: this.head, entries });
      }
      return json(404, { code: "not_found", message: u.pathname });
    });
  }
}

export const noopIndex = (): AsyncIndex => ({
  setAll() {}, upsert() {}, remove() {}, rename() {},
  search: async () => [], quickSwitch: async () => [], backlinks: async () => [],
  parsed: async () => undefined, allTags: async () => [], resolve: async () => null, dispose() {},
});

let counter = 0;
export function uniqueRepo(): RepoRef { return { owner: "me", name: `repo${++counter}-${Date.now()}`, branch: "main" }; }

export function makeVault() {
  return new Vault({ auto: false, indexFactory: noopIndex, api: new SyncApi({ sleep: async () => {}, baseDelayMs: 0 }) });
}

export async function openVault(gh: FakeGithub, repo = uniqueRepo()) {
  const v = makeVault();
  const r = await v.open(repo);
  await v.pullNow();
  return { v, repo, r };
}
