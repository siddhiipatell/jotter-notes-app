import { describe, it, expect, vi, afterEach } from "vitest";
import { commitChanges, getTree, listRepos } from "@/lib/server/github";
import { ApiException } from "@/lib/server/errors";

const repo = { owner: "o", name: "r", branch: "main" };
const BASE = "b".repeat(40);
const j = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers });

type Route = (url: string, init?: RequestInit) => Response | undefined;
function mockFetch(...routes: Route[]) {
  const calls: { url: string; method: string; body?: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined });
    for (const r of routes) { const res = r(url, init); if (res) return res; }
    return j({ message: "nope" }, 404);
  }));
  return calls;
}
const happy = (headSha = BASE, refStatus = 200): Route[] => [
  (u) => u.endsWith("/git/ref/heads/main") ? j({ object: { sha: headSha } }) : undefined,
  (u) => u.endsWith(`/git/commits/${headSha}`) ? j({ tree: { sha: "t0" } }) : undefined,
  (u, i) => u.endsWith("/git/blobs") && i?.method === "POST" ? j({ sha: "blob1" }, 201) : undefined,
  (u, i) => u.endsWith("/git/trees") && i?.method === "POST" ? j({ sha: "t1" }, 201) : undefined,
  (u, i) => u.endsWith("/git/commits") && i?.method === "POST" ? j({ sha: "c1" }, 201) : undefined,
  (u, i) => u.endsWith("/git/refs/heads/main") && i?.method === "PATCH" ? j({ message: "x" }, refStatus) : undefined,
];
afterEach(() => vi.unstubAllGlobals());

describe("commitChanges", () => {
  const req = { baseSha: BASE, message: "msg", changes: [{ path: "a.md", contentBase64: "aGk=" }, { path: "old.md", contentBase64: null }] };

  it("orchestrates blobs -> tree (sha:null deletes) -> commit -> non-force ref update", async () => {
    const calls = mockFetch(...happy());
    const res = await commitChanges("tok", repo, req);
    expect(res).toEqual({ headSha: "c1", entries: [{ path: "a.md", sha: "blob1" }] });
    const tree = calls.find((c) => c.url.endsWith("/git/trees"))!.body;
    expect(tree.base_tree).toBe("t0");
    expect(tree.tree).toEqual([
      { path: "a.md", mode: "100644", type: "blob", sha: "blob1" },
      { path: "old.md", mode: "100644", type: "blob", sha: null },
    ]);
    expect(calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST")!.body.parents).toEqual([BASE]);
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ sha: "c1", force: false });
  });

  it("is stale when head != baseSha, before writing anything", async () => {
    const calls = mockFetch(...happy("d".repeat(40)));
    await expect(commitChanges("tok", repo, req)).rejects.toMatchObject({ code: "stale" });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("is stale when the ref update returns 422", async () => {
    mockFetch(...happy(BASE, 422));
    await expect(commitChanges("tok", repo, req)).rejects.toMatchObject({ code: "stale" });
  });
});

describe("error mapping & reads", () => {
  it.each([
    [401, {}, "unauthenticated"],
    [403, { "x-ratelimit-remaining": "0" }, "rate_limited"],
    [429, {}, "rate_limited"],
    [404, {}, "not_found"],
    [500, {}, "upstream"],
  ])("maps %i", async (status, headers, code) => {
    mockFetch(() => j({ message: "x" }, status as number, headers as Record<string, string>));
    const e = await listRepos("t").catch((x) => x);
    expect(e).toBeInstanceOf(ApiException);
    expect(e.code).toBe(code);
  });

  it("filters tree to blobs and flags truncation", async () => {
    mockFetch(...happy(), (u) => u.includes("/git/trees/") ? j({ truncated: true, tree: [
      { path: "d", type: "tree", sha: "1" }, { path: "d/a.md", type: "blob", sha: "2", size: 5 },
    ] }) : undefined);
    expect(await getTree("t", repo)).toEqual({ headSha: BASE, truncated: true, entries: [{ path: "d/a.md", sha: "2", size: 5 }] });
  });

  it("paginates repos", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `r${i}`, owner: { login: "o" }, default_branch: "main", private: false }));
    const calls = mockFetch((u) => u.includes("page=1&") ? j(mk(100)) : u.includes("page=2&") ? j(mk(3)) : undefined);
    expect(await listRepos("t")).toHaveLength(103);
    expect(calls).toHaveLength(2);
  });
});
