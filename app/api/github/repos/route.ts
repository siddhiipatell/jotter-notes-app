import { handle } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { requireSession } from "@/lib/server/session";
import { listRepos } from "@/lib/server/github";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => json(await listRepos((await requireSession(req)).token)));
