import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

export const DELETE = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.removeMember(ctx, params.id!, params.userId!));
});
