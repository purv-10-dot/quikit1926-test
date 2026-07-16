import { assertMembership, withOrgAuth } from "@/lib/auth-shims";
import { listChannelKbSourceFileIds } from "@/lib/server/kb.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/channels/[id]/kb-docs → { sourceFileIds: string[] }
 *
 * The mount read seam for Stage-3 retrieval (Option B). Returns the channel's
 * persisted KB-ingested source-file ids (= storageKeys) so the AI-chat can seed
 * this conversation's retrieval scope on load — pagination-proof (queries all
 * marked Media messages, not just the loaded window). Membership-gated for
 * tenant isolation; no assistant/RBAC gate (reading your own channel's ingested
 * doc list is strictly narrower than the assistant grant that already gates use).
 */
export const GET = withOrgAuth(async (_req, ctx, params) => {
  const channelId = params.id!;
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const sourceFileIds = await listChannelKbSourceFileIds(ctx.orgId, channelId);
  return Response.json({ sourceFileIds });
});
