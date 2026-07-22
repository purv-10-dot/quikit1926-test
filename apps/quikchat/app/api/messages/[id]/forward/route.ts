import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import type { ForwardMessageInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as messages from "@/lib/server/messages.service";

export const dynamic = "force-dynamic";

export const POST = withOrgAuth(async (req, ctx, params) => {
  const body = (await readJson(req)) as unknown as ForwardMessageInput;
  if (!Array.isArray(body.channelIds) || body.channelIds.length === 0) {
    throw new HttpError(400, "channelIds must be a non-empty array");
  }
  return Response.json(await messages.forward(ctx, params.id!, body.channelIds, body.note));
});
