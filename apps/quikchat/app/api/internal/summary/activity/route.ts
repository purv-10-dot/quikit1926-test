import { withInternalAuth } from "@/lib/auth-shims";
import { activitySummary } from "@/lib/server/internal.service";

export const dynamic = "force-dynamic";

export const GET = withInternalAuth(async (_req, actor) => {
  return Response.json(await activitySummary(actor));
});
