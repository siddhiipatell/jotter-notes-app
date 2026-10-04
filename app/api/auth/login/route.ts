import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { appUrl, handle } from "@/lib/server/route";
import { STATE_COOKIE } from "@/lib/server/session";
import { ApiException } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new ApiException("upstream", "GitHub OAuth is not configured");
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl()}/api/auth/callback`);
  // Scope: "repo" is the minimum that grants read/write on PRIVATE repositories via
  // the Git Data API. If you only need public repos, "public_repo" would suffice.
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return res;
});
