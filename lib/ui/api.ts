import type { ApiError, RepoRef, RepoSummary, SessionInfo } from "@/lib/types";

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiError["code"]) { super(message); this.name = "HttpError"; }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    throw new HttpError("Network error. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    let err: Partial<ApiError> = {};
    try { err = (await res.json()) as ApiError; } catch { /* not json */ }
    throw new HttpError(err.message ?? `Request failed (${res.status})`, res.status, err.code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const getSession = () => call<SessionInfo>("/api/session");
export const listRepos = () => call<RepoSummary[]>("/api/github/repos");
export const selectRepo = (repo: RepoRef) =>
  call<unknown>("/api/session/repo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: repo.owner, name: repo.name, branch: repo.branch }) });
export const logoutRequest = () => call<unknown>("/api/auth/logout", { method: "POST" });
export const loginUrl = "/api/auth/login";
