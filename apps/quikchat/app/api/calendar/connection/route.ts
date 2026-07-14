import { withOrgAuth } from "@/lib/auth-shims";
import * as calendar from "@/lib/server/calendar.service";

export const dynamic = "force-dynamic";

// GET /api/calendar/connection — active provider + the caller's connect state.
export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await calendar.getConnectionStatus(ctx));
});
