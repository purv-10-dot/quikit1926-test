import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";
import { readJson } from "@/lib/server/helpers";

export const dynamic = "force-dynamic";

export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const body = await readJson(req);
  const role = body.role;
  if (role !== "admin" && role !== "member") {
    throw new HttpError(400, "role must be 'admin' or 'member'");
  }
  return Response.json(await channels.updateMemberRole(ctx, params.id!, params.userId!, role));
});
