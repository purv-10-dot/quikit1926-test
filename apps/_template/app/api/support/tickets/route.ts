/**
 * Platform support tickets raised from your app.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * The query itself lives in `@quikit/shared/supportTickets` and is identical in
 * every app; this file only supplies your app's auth guard and slug.
 *
 * Deliberately NOT gated by a `moduleKey` or an RBAC `permission`: a user who
 * has been locked out of a module must still be able to report that they are
 * locked out. `withOrgAuth` still enforces session + active org membership, so
 * this is not an open endpoint. Creation is rate-limited inside
 * `createSupportTicket` (10/hour per user, shared across every app).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";

/** Context this app's `withOrgAuth` injects after the session + org guard. */
interface OrgAuthCtx {
  orgId: string;
  userId: string;
}

/** CHANGE ME to your app's registry slug (packages/database/prisma/seed-oauth.ts). */
const APP_SLUG = "__template";

export const GET = withOrgAuth(
  async ({ orgId, userId }: OrgAuthCtx, req: NextRequest) => {
    const query = parseSupportListQuery(req.nextUrl.searchParams);
    const result = await listSupportTickets({ orgId, userId, ...query });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      data: result.data.tickets,
      meta: result.data.meta,
    });
  },
  { fallbackErrorMessage: "Failed to load support tickets" },
);

export const POST = withOrgAuth(
  async ({ orgId, userId }: OrgAuthCtx, req: NextRequest) => {
    const result = await createSupportTicket({
      orgId,
      userId,
      appSlug: APP_SLUG,
      body: await req.json().catch(() => null),
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });
  },
  { fallbackErrorMessage: "Failed to submit support request" },
);
