import { handle } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { requireRepoSession } from "@/lib/server/session";
import { validateSha } from "@/lib/server/validate";
import { getBlob } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireRepoSession(req);
  const sha = validateSha(req.nextUrl.searchParams.get("sha"));
  return json(await getBlob(s.token, s.repo, sha));
});
