import { withOrgAuth } from "@/lib/auth-shims";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const DELETE = withOrgAuth(
  async (_req, ctx, params) => {
    await notifications.removeKeyword(ctx, params.id!);
    return Response.json({ ok: true });
  },
  { rateLimit: RATE.notifyWrite },
);
