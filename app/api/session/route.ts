import { handle } from "@/lib/server/route";
import { json } from "@/lib/server/errors";
import { getSession, toSessionInfo } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => json(toSessionInfo(await getSession(req))));
