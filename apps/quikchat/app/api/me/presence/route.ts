import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import { getMyPresence, isSetStatus, setMyPresence } from "@/lib/server/presence.service";

export const dynamic = "force-dynamic";

/** GET /api/me/presence — the caller's current set-status. */
export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await getMyPresence(ctx));
});

/**
 * PUT /api/me/presence { status, statusMessage?, expiresAt? } — set the caller's
 * status. `status` is one of available | busy | dnd | brb | away | appear_offline
 * (the durable, user-set statuses only — on_call/online/offline are derived).
 * `expiresAt` is an absolute ISO instant (client-computed, timezone-correct) at
 * which the status auto-reverts to available; null/omitted = until changed. Reset
 * is just { status: "available", expiresAt: null }.
 */
export const PUT = withOrgAuth(async (req, ctx) => {
  const body = await readJson(req);
  if (!isSetStatus(body.status)) {
    throw new HttpError(400, "status must be available|busy|dnd|brb|away|appear_offline");
  }
  if (body.statusMessage !== undefined && body.statusMessage !== null && typeof body.statusMessage !== "string") {
    throw new HttpError(400, "statusMessage must be a string");
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "string") {
    throw new HttpError(400, "expiresAt must be an ISO string or null");
  }
  return Response.json(
    await setMyPresence(ctx, {
      status: body.status,
      statusMessage: body.statusMessage as string | null | undefined,
      expiresAt: body.expiresAt as string | null | undefined,
    }),
  );
});
