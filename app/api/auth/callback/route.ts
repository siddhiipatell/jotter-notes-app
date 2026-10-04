import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/server/route";
import { STATE_COOKIE, setSessionCookie } from "@/lib/server/session";
import { getUser } from "@/lib/server/github";

export const dynamic = "force-dynamic";

function fail(reason: string) {
  const res = NextResponse.redirect(`${appUrl()}/?auth_error=${encodeURIComponent(reason)}`);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return res;
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (req.nextUrl.searchParams.get("error")) return fail("denied");
  if (!code || !state || !cookieState || !sameState(state, cookieState)) return fail("state");
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "jotter" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${appUrl()}/api/auth/callback`,
      }),
      cache: "no-store",
    });
    const data = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !data.access_token) return fail("exchange");
    const user = await getUser(data.access_token);
    const res = NextResponse.redirect(`${appUrl()}/`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    try {
      await setSessionCookie(res, { token: data.access_token, user, repo: null });
    } catch (e) {
      console.error("auth: could not create session cookie:", e instanceof Error ? e.message : "unknown");
      return fail("config");
    }
    return res;
  } catch {
    return fail("exchange");
  }
}
