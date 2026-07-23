import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as messages from "@/lib/server/messages.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const body = await readJson(req);
    const emoji = body.emoji;
    if (typeof emoji !== "string" || !emoji || emoji.length > 16) {
      throw new HttpError(400, "emoji is required");
    }
    const { message } = await messages.toggleReaction(ctx, params.id!, emoji);
    return Response.json(message);
  },
  { rateLimit: RATE.reaction },
);
