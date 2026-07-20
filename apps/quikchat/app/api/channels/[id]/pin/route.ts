import { withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";
import { readJson } from "@/lib/server/helpers";

export const dynamic = "force-dynamic";

export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const body = await readJson(req);
  return Response.json(await channels.setPinned(ctx, params.id!, !!body.pinned));
});
