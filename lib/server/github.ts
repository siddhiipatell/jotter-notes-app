import type {
  CommitRequest, CommitResponse, RepoRef, RepoSummary, TreeResponse,
} from "@/lib/types";
import { ApiException } from "./errors";

const API = "https://api.github.com";
const MAX_REPO_PAGES = 10;

interface GhOpts { method?: string; body?: unknown; staleOn422?: boolean }

/** Never logs request/response bodies or the token. */
async function gh(token: string, path: string, opts: GhOpts = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "jotter",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiException("upstream", "Could not reach GitHub");
  }
  if (res.ok) return res;
  const s = res.status;
  if (s === 401) throw new ApiException("unauthenticated", "GitHub rejected the session; sign in again");
  if (s === 429 || (s === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) {
    throw new ApiException("rate_limited", "GitHub rate limit reached; try again shortly");
  }
  if (s === 403) {
    // Secondary rate limits sometimes lack headers; check the message only (not note content).
    let msg = "";
    try { msg = String(((await res.json()) as { message?: string }).message ?? ""); } catch { /* ignore */ }
    if (/rate limit|abuse/i.test(msg)) throw new ApiException("rate_limited", "GitHub rate limit reached; try again shortly");
    throw new ApiException("upstream", `GitHub denied access (403)${msg ? `: ${msg.slice(0, 200)}` : ""}. If this repo belongs to an organization, approve this OAuth app for it in the org's settings.`);
  }
  if (s === 404) throw new ApiException("not_found", "Not found on GitHub");
  if (s === 422 && opts.staleOn422) throw new ApiException("stale", "Remote changed since last sync");
  let detail = "";
  try { detail = String(((await res.json()) as { message?: string }).message ?? "").slice(0, 200); } catch { /* ignore */ }
  if (s === 409 && /empty/i.test(detail)) {
    throw new ApiException("bad_request", "This repository is empty. Create a first commit (for example add a README on github.com), then pick it again.");
  }
  throw new ApiException("upstream", `GitHub error (${s})${detail ? `: ${detail}` : ""}`);
}

async function ghJson<T>(token: string, path: string, opts?: GhOpts): Promise<T> {
  const res = await gh(token, path, opts);
  try { return (await res.json()) as T; } catch { throw new ApiException("upstream", "Invalid response from GitHub"); }
}

const enc = encodeURIComponent;
const branchPath = (b: string) => b.split("/").map(enc).join("/");
const repoPath = (r: RepoRef) => `/repos/${enc(r.owner)}/${enc(r.name)}`;

export async function getUser(token: string): Promise<{ login: string; name: string | null; avatarUrl: string }> {
  const u = await ghJson<{ login: string; name: string | null; avatar_url: string }>(token, "/user");
  return { login: u.login, name: u.name ?? null, avatarUrl: u.avatar_url };
}

export async function listRepos(token: string): Promise<RepoSummary[]> {
  const out: RepoSummary[] = [];
  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    const batch = await ghJson<{ name: string; owner: { login: string }; default_branch: string; private: boolean }[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
    );
    for (const r of batch) out.push({ owner: r.owner.login, name: r.name, branch: r.default_branch, private: r.private });
    if (batch.length < 100) break;
  }
  return out;
}

/** Confirms the repo exists, the user can push, and the branch exists. */
export async function validateRepoAccess(token: string, repo: RepoRef): Promise<void> {
  const r = await ghJson<{ permissions?: { push?: boolean } }>(token, repoPath(repo));
  if (r.permissions && r.permissions.push === false) {
    throw new ApiException("bad_request", "You do not have write access to this repository");
  }
  await getHeadSha(token, repo);
}

export async function getHeadSha(token: string, repo: RepoRef): Promise<string> {
  const ref = await ghJson<{ object: { sha: string } }>(token, `${repoPath(repo)}/git/ref/heads/${branchPath(repo.branch)}`);
  return ref.object.sha;
}

export async function getTree(token: string, repo: RepoRef): Promise<TreeResponse> {
  const headSha = await getHeadSha(token, repo);
  const t = await ghJson<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(
    token, `${repoPath(repo)}/git/trees/${headSha}?recursive=1`,
  );
  return {
    headSha,
    truncated: !!t.truncated,
    entries: t.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, sha: e.sha, size: e.size ?? 0 })),
  };
}

export async function getBlob(token: string, repo: RepoRef, sha: string): Promise<{ contentBase64: string }> {
  const b = await ghJson<{ content: string; encoding: string }>(token, `${repoPath(repo)}/git/blobs/${sha}`);
  if (b.encoding !== "base64") throw new ApiException("upstream", "Unexpected blob encoding");
  return { contentBase64: b.content.replace(/\s+/g, "") };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * One commit via the Git Data API. `req` must already be validated.
 * Stale (head != baseSha, or ref update rejected with 422) -> ApiException("stale").
 * The commit author is whoever owns the token.
 */
export async function commitChanges(token: string, repo: RepoRef, req: CommitRequest): Promise<CommitResponse> {
  const rp = repoPath(repo);
  const head = await getHeadSha(token, repo);
  if (head !== req.baseSha) throw new ApiException("stale", "Remote changed since last sync");

  const baseCommit = await ghJson<{ tree: { sha: string } }>(token, `${rp}/git/commits/${head}`);

  const tree = await mapLimit(req.changes, 4, async (c) => {
    if (c.contentBase64 === null) {
      return { path: c.path, mode: "100644", type: "blob", sha: null as string | null };
    }
    const blob = await ghJson<{ sha: string }>(token, `${rp}/git/blobs`, {
      method: "POST", body: { content: c.contentBase64, encoding: "base64" },
    });
    return { path: c.path, mode: "100644", type: "blob", sha: blob.sha as string | null };
  });

  const newTree = await ghJson<{ sha: string }>(token, `${rp}/git/trees`, {
    method: "POST", body: { base_tree: baseCommit.tree.sha, tree },
  });
  const commit = await ghJson<{ sha: string }>(token, `${rp}/git/commits`, {
    method: "POST", body: { message: req.message, tree: newTree.sha, parents: [req.baseSha] },
  });
  await gh(token, `${rp}/git/refs/heads/${branchPath(repo.branch)}`, {
    method: "PATCH", body: { sha: commit.sha, force: false }, staleOn422: true,
  });

  return {
    headSha: commit.sha,
    entries: tree.filter((t) => t.sha !== null).map((t) => ({ path: t.path, sha: t.sha as string })),
  };
}
