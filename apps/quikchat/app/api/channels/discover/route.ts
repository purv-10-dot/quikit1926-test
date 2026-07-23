import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  return Response.json(await channels.discover(ctx, q, Number.isFinite(limit) ? limit : undefined));
});
