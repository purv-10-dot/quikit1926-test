import { withInternalAuth } from "@/lib/auth-shims";
import { channelSummary } from "@/lib/server/internal.service";

export const dynamic = "force-dynamic";

export const GET = withInternalAuth(async (_req, actor, params) => {
  return Response.json(await channelSummary(actor, params.id!));
});
