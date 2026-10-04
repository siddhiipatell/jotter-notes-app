import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { RepoRef, SessionInfo } from "@/lib/types";
import { ApiException } from "./errors";

export const SESSION_COOKIE = "jotter_session";
export const STATE_COOKIE = "jotter_oauth_state";
const MAX_AGE_S = 60 * 60 * 24 * 7;

export interface SessionUser { login: string; name: string | null; avatarUrl: string }
/** Everything in here is sealed; the token never leaves the server. */
export interface Session { token: string; user: SessionUser; repo: RepoRef | null }

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

export async function sealSession(s: Session): Promise<string> {
  return new EncryptJWT({ token: s.token, user: s.user, repo: s.repo })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .encrypt(key());
}

export async function unsealSession(jwe: string | undefined): Promise<Session | null> {
  if (!jwe) return null;
  try {
    const { payload } = await jwtDecrypt(jwe, key(), { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    if (typeof payload.token !== "string" || !payload.user) return null;
    return { token: payload.token, user: payload.user as SessionUser, repo: (payload.repo as RepoRef | null) ?? null };
  } catch {
    return null;
  }
}

const secure = () => process.env.NODE_ENV === "production";

export async function setSessionCookie(res: NextResponse, s: Session): Promise<void> {
  res.cookies.set(SESSION_COOKIE, await sealSession(s), {
    httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: MAX_AGE_S,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getSession(req: NextRequest): Promise<Session | null> {
  return unsealSession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function requireSession(req: NextRequest): Promise<Session> {
  const s = await getSession(req);
  if (!s) throw new ApiException("unauthenticated", "Not signed in");
  return s;
}

export async function requireRepoSession(req: NextRequest): Promise<Session & { repo: RepoRef }> {
  const s = await requireSession(req);
  if (!s.repo) throw new ApiException("no_repo", "No repository selected");
  return s as Session & { repo: RepoRef };
}

export function toSessionInfo(s: Session | null): SessionInfo {
  return s ? { user: s.user, repo: s.repo } : { user: null, repo: null };
}
