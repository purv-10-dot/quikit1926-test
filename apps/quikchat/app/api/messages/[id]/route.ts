import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import type { EditMessageInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as messages from "@/lib/server/messages.service";

export const dynamic = "force-dynamic";

export const DELETE = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await messages.deleteForEveryone(ctx, params.id!));
});

export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const body = (await readJson(req)) as unknown as EditMessageInput;
  if (typeof body.content !== "string") throw new HttpError(400, "content is required");
  return Response.json(await messages.editMessage(ctx, params.id!, body.content, body.mentions));
});
