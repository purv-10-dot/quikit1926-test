import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import {
  getMyPresence,
  isSetStatus,
  setMyPresence,
  type SetStatus,
} from "@/lib/server/presence.service";

export const dynamic = "force-dynamic";

/** GET /api/me/presence — the caller's current set-status. */
export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await getMyPresence(ctx));
});

/**
 * PUT /api/me/presence { status?, statusMessage?, expiresAt?, shareLastSeen? } —
 * set the caller's status and/or their last-seen privacy flag. `status` is one of
 * available | busy | dnd | brb | away | appear_offline (the durable, user-set
 * statuses only — on_call/online/offline are derived). `expiresAt` is an absolute
 * ISO instant (client-computed, timezone-correct) at which the status auto-reverts
 * to available; null/omitted = until changed. Reset is just
 * { status: "available", expiresAt: null }.
 *
 * `status` is optional so the Privacy settings toggle can send
 * { shareLastSeen } alone without restating (and risking clobbering) the current
 * status. At least one of the two must be present. Callers that send `status`
 * behave exactly as before.
 */
export const PUT = withOrgAuth(async (req, ctx) => {
  const body = await readJson(req);
  const hasStatus = body.status !== undefined;
  const hasShareLastSeen = body.shareLastSeen !== undefined;
  if (!hasStatus && !hasShareLastSeen) {
    throw new HttpError(400, "provide status and/or shareLastSeen");
  }
  if (hasStatus && !isSetStatus(body.status)) {
    throw new HttpError(400, "status must be available|busy|dnd|brb|away|appear_offline");
  }
  if (hasShareLastSeen && typeof body.shareLastSeen !== "boolean") {
    throw new HttpError(400, "shareLastSeen must be a boolean");
  }
  if (body.statusMessage !== undefined && body.statusMessage !== null && typeof body.statusMessage !== "string") {
    throw new HttpError(400, "statusMessage must be a string");
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "string") {
    throw new HttpError(400, "expiresAt must be an ISO string or null");
  }
  return Response.json(
    await setMyPresence(ctx, {
      ...(hasStatus ? { status: body.status as SetStatus } : {}),
      statusMessage: body.statusMessage as string | null | undefined,
      expiresAt: body.expiresAt as string | null | undefined,
      ...(hasShareLastSeen ? { shareLastSeen: body.shareLastSeen as boolean } : {}),
    }),
  );
});
