import { withOrgAuth } from "@/lib/auth-shims";
import type { CreateChannelInput } from "@/lib/shared";
import * as channels from "@/lib/server/channels.service";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await channels.listForUser(ctx));
});

export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = (await readJson(req)) as unknown as CreateChannelInput;
    return Response.json(await channels.create(ctx, body));
  },
  { rateLimit: RATE.channelCreate },
);
