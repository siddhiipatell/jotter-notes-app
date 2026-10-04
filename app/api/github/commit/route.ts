import { handle, readJson } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { requireRepoSession } from "@/lib/server/session";
import { validateCommitRequest } from "@/lib/server/validate";
import { commitChanges } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const s = await requireRepoSession(req);
  const body = validateCommitRequest(await readJson(req));
  return json(await commitChanges(s.token, s.repo, body));
});
