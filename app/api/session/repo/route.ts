import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/server/route";
import { requireSession, setSessionCookie, toSessionInfo } from "@/lib/server/session";
import { validateRepoRef } from "@/lib/server/validate";
import { validateRepoAccess } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const s = await requireSession(req);
  const repo = validateRepoRef(await readJson(req));
  await validateRepoAccess(s.token, repo);
  const next = { ...s, repo };
  const res = NextResponse.json(toSessionInfo(next), { headers: { "Cache-Control": "no-store" } });
  await setSessionCookie(res, next);
  return res;
});
