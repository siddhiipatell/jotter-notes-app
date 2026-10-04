import type { ApiError } from "@/lib/types";

const STATUS: Record<ApiError["code"], number> = {
  unauthenticated: 401,
  no_repo: 400,
  stale: 409,
  rate_limited: 429,
  not_found: 404,
  bad_request: 400,
  upstream: 502,
};

/** Thrown anywhere in server code; converted to an ApiError JSON response. */
export class ApiException extends Error {
  readonly code: ApiError["code"];
  constructor(code: ApiError["code"], message: string) {
    super(message);
    this.name = "ApiException";
    this.code = code;
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiException) {
    const body: ApiError = { code: e.code, message: e.message };
    return Response.json(body, { status: e.status, headers: { "Cache-Control": "no-store" } });
  }
  // Never echo unknown error details (could contain upstream data).
  const body: ApiError = { code: "upstream", message: "Unexpected server error" };
  return Response.json(body, { status: 502, headers: { "Cache-Control": "no-store" } });
}

export function json<T>(data: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}
