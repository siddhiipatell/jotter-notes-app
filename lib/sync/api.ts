import type { ApiError, CommitRequest, CommitResponse, TreeResponse } from "../types";

export type SyncErrorCode = ApiError["code"] | "offline";

export class SyncApiError extends Error {
  constructor(public code: SyncErrorCode, message: string, public status = 0) {
    super(message);
    this.name = "SyncApiError";
  }
}

export interface SyncApiOptions {
  baseUrl?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Typed client for the stateless GitHub broker routes. */
export class SyncApi {
  private baseUrl: string;
  private maxRetries: number;
  private baseDelayMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(o: SyncApiOptions = {}) {
    this.baseUrl = o.baseUrl ?? "";
    this.maxRetries = o.maxRetries ?? 3;
    this.baseDelayMs = o.baseDelayMs ?? 500;
    this.sleep = o.sleep ?? defaultSleep;
  }

  head(): Promise<{ headSha: string }> { return this.req("GET", "/api/github/head"); }
  tree(): Promise<TreeResponse> { return this.req("GET", "/api/github/tree"); }
  async blob(sha: string): Promise<string> {
    const r = await this.req<{ contentBase64: string }>("GET", `/api/github/blob?sha=${encodeURIComponent(sha)}`);
    return r.contentBase64;
  }
  /** Commits are retried only on 429 (never on 5xx, to avoid double commits). */
  commit(body: CommitRequest): Promise<CommitResponse> { return this.req("POST", "/api/github/commit", body, false); }

  private async req<T>(method: string, path: string, body?: unknown, retry5xx = true): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(this.baseUrl + path, {
          method,
          credentials: "same-origin",
          headers: body !== undefined ? { "content-type": "application/json" } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new SyncApiError("offline", "Network unavailable");
      }
      if (res.ok) return (await res.json()) as T;
      let err: Partial<ApiError> = {};
      try { err = await res.json(); } catch { /* non-JSON error body */ }
      const retriable = res.status === 429 || (retry5xx && res.status >= 500);
      if (retriable && attempt < this.maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        await this.sleep(ra > 0 ? ra * 1000 : this.baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new SyncApiError(err.code ?? codeFor(res.status), err.message ?? `HTTP ${res.status}`, res.status);
    }
  }
}

function codeFor(status: number): SyncErrorCode {
  switch (status) {
    case 401: return "unauthenticated";
    case 404: return "not_found";
    case 409: return "stale";
    case 429: return "rate_limited";
    case 400: return "bad_request";
    default: return "upstream";
  }
}
