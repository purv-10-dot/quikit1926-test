import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await notifications.listKeywords(ctx));
});

/** POST /api/notifications/keywords { keyword } — trim/lowercase/dedupe. */
export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = await readJson(req);
    if (typeof body.keyword !== "string") throw new HttpError(400, "keyword is required");
    return Response.json(await notifications.addKeyword(ctx, body.keyword));
  },
  { rateLimit: RATE.notifyWrite },
);
