import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

export const PATCH = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.markRead(ctx, params.id!));
});
