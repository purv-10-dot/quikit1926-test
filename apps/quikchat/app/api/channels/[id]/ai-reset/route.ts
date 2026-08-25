import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";
import { RATE } from "@/lib/server/rate-limits";
import { userCan } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/[id]/ai-reset — start a new chat in the caller's AI chat.
 *
 * Drops a context-reset marker so the assistant stops seeing everything above it.
 * NOTHING IS DELETED: the transcript stays, and so does the channel's knowledge-base
 * scope. Returns the marker as an ordinary MessageDto, which the client can drop
 * straight into the message cache.
 *
 * Gated on `Assistant:create`, the same capability as `openAiChat` and the assist
 * relay — resetting the assistant's context is assistant use, and a Guest who
 * cannot open the AI chat must not be able to reset one either.
 *
 * Rate-limited as an ordinary write, NOT as `RATE.assist`: no runtime call, no LLM
 * turn, just one row. `assist`'s 10/60s is sized for model turns and would be the
 * wrong ceiling for a button someone may double-tap.
 */
export const POST = withOrgAuth(
  async (_req, ctx, params) => {
    const channelId = params.id!;
    if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
      throw new HttpError(403, "You do not have permission to use the assistant");
    }
    return Response.json(await channels.resetAiChatContext(ctx, channelId));
  },
  { rateLimit: RATE.notifyWrite, moduleKey: "assistant" },
);
