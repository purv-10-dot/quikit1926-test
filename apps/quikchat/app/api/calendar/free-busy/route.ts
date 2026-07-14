import { withOrgAuth } from "@/lib/auth-shims";
import * as calendar from "@/lib/server/calendar.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// GET /api/calendar/free-busy?userIds=a,b&from=ISO&to=ISO — busy blocks per user
// over [from,to]. The service asserts every target shares the caller's org.
export const GET = withOrgAuth(
  async (req, ctx) => {
    const url = new URL(req.url);
    const userIds = (url.searchParams.get("userIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    return Response.json(await calendar.getFreeBusy(ctx, userIds, from, to));
  },
  { rateLimit: RATE.freeBusy },
);
