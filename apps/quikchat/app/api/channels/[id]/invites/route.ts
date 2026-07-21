import { withOrgAuth } from "@/lib/auth-shims";
import type { CreateInviteInput } from "@/lib/shared";
import * as channels from "@/lib/server/channels.service";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.listInvites(ctx, params.id!));
});

export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as CreateInviteInput;
    return Response.json(await channels.createInvite(ctx, params.id!, body));
  },
  { rateLimit: RATE.inviteCreate },
);
