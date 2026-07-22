import { withOrgAuth } from "@/lib/auth-shims";
import * as messages from "@/lib/server/messages.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await messages.listPinned(ctx, params.id!));
});
