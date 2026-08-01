import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/[id]/delete — admin delete-for-everyone (QC_008).
 * Dedicated route (NOT the plain DELETE, which is "leave") so the destructive
 * delete-the-whole-group action can never be reached by an accidental DELETE.
 * Admin/moderator gate + group-only guard live in the service.
 */
export const POST = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.deleteChannel(ctx, params.id!));
});
