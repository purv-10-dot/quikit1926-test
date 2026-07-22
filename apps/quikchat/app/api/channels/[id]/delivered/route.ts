import { withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/channels/[id]/delivered { at? } — advance the caller's delivery
 * watermark (monotonic) and fan out a `delivered` event. Mirrors `…/read`.
 */
export const PATCH = withOrgAuth(
  async (req, ctx, params) => {
    const body = await readJson(req);
    const at = typeof body.at === "string" ? body.at : undefined;
    return Response.json(await channels.markDelivered(ctx, params.id!, at));
  },
  { rateLimit: RATE.delivered },
);
