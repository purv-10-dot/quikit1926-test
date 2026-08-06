import { withOrgAuth } from "@/lib/auth-shims";
import * as calling from "@/lib/server/calling/calling.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/calls/history — the caller's terminal calls, newest first, for the
 * Calls → History pane. Live (ringing/active) calls are excluded; those are
 * served by `GET /api/calls/active` for rejoin.
 */
export const GET = withOrgAuth(
  async (_req, ctx) => Response.json(await calling.listHistory(ctx)),
  { moduleKey: "calls" },
);
