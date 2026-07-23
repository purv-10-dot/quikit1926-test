import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.listMembers(ctx, params.id!));
});

export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const body = await readJson(req);
    const userId = body.userId;
    if (typeof userId !== "string" || !userId) throw new HttpError(400, "userId is required");
    return Response.json(await channels.addMember(ctx, params.id!, userId));
  },
  { rateLimit: RATE.memberAdd },
);
