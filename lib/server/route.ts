import type { NextRequest } from "next/server";
import { errorResponse } from "./errors";

/** Wraps a handler so thrown ApiExceptions become ApiError responses. */
export function handle(fn: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    try { return await fn(req); } catch (e) { return errorResponse(e); }
  };
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}
