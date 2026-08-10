import { withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as channels from "@/lib/server/channels.service";
import type { UpdateChannelInput } from "@/lib/shared";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.findById(ctx, params.id!));
});

// Edit group details (name / description / avatar). Admin/moderator-gated,
// group-only — enforced in the service.
export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const body = (await readJson(req)) as UpdateChannelInput;
  const patch: UpdateChannelInput = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl;
  return Response.json(await channels.updateChannel(ctx, params.id!, patch));
});

// NOTE: DELETE = the caller LEAVES the channel (self-removal). Admin
// delete-for-everyone lives on the dedicated POST /api/channels/[id]/delete
// route — kept separate so a stray DELETE can never nuke the group.
export const DELETE = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await channels.leave(ctx, params.id!));
});
