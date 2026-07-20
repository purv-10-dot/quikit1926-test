import { withInternalAuth } from "@/lib/auth-shims";
import { threadSummary } from "@/lib/server/internal.service";

export const dynamic = "force-dynamic";

export const GET = withInternalAuth(async (_req, actor, params) => {
  return Response.json(await threadSummary(actor, params.rootMessageId!));
});
