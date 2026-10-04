import { handle } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { requireRepoSession } from "@/lib/server/session";
import { getTree } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireRepoSession(req);
  return json(await getTree(s.token, s.repo));
});
