import { NextResponse } from "next/server";
import { handle } from "@/lib/server/route";
import { clearSessionCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res);
  return res;
});
