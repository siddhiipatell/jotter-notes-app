import { handle } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { requireRepoSession } from "@/lib/server/session";
import { getHeadSha } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireRepoSession(req);
  const headSha = await getHeadSha(s.token, s.repo);
  const etag = `"${headSha}"`;
  const inm = req.headers.get("if-none-match");
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (inm && inm.split(",").some((v) => v.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return json({ headSha }, { headers });
});
