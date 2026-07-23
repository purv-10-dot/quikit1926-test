import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.findById(ctx, params.id!));
});

export const DELETE = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.leave(ctx, params.id!));
});
