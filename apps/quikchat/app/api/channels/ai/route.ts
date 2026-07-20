import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/ai — open (find-or-create) the caller's AI-chat singleton.
 * Idempotent: repeat calls return the same channel. The static `ai` segment
 * resolves ahead of the sibling `[id]` dynamic route (Next.js prefers static
 * segments), same as `channels/discover`.
 */
export const POST = withOrgAuth(
  async (_req, ctx) => {
    return Response.json(await channels.findOrCreateAiChat(ctx));
  },
  { rateLimit: RATE.channelCreate, moduleKey: "assistant" },
);
