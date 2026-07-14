import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { buildAuthUrl, microsoftConfigFromEnv, signState } from "@/lib/server/calendar/microsoft";
import * as microsoft from "@/lib/server/calendar/microsoft";

export const dynamic = "force-dynamic";

// GET /api/calendar/microsoft/connect — redirect the user to MS consent.
export const GET = withOrgAuth(async (_req, ctx) => {
  const cfg = microsoftConfigFromEnv();
  if (!cfg) throw new HttpError(400, "Microsoft calendar is not configured");
  const url = buildAuthUrl(cfg, signState(cfg, ctx.userId));
  return new Response(null, { status: 302, headers: { location: url } });
});

// DELETE /api/calendar/microsoft/connect — disconnect (delete the stored token).
export const DELETE = withOrgAuth(async (_req, ctx) => {
  await microsoft.disconnect(ctx.userId);
  return Response.json({ disconnected: true });
});
