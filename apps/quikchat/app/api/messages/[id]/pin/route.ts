import { withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as messages from "@/lib/server/messages.service";

export const dynamic = "force-dynamic";

export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const body = await readJson(req);
  return Response.json(await messages.setPinned(ctx, params.id!, !!body.pinned));
});
