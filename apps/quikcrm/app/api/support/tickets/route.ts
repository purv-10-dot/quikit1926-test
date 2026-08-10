/**
 * Platform support tickets raised from QuikCRM.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * The query itself lives in `@quikit/shared/supportTickets` and is identical in
 * every app; this file only supplies QuikCRM's auth guard and slug.
 *
 * Deliberately NOT gated by a CRM RBAC check: a user who has been locked out of
 * a module must still be able to report that they are locked out.
 * `withTenantAuth` still enforces session + selected org, so this is not an
 * open endpoint. Creation is rate-limited inside `createSupportTicket`
 * (10/hour per user, shared across every app).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";

const APP_SLUG = "quikcrm";

export const GET = withTenantAuth(
  async ({ orgId, userId }, req: NextRequest) => {
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

export const POST = withTenantAuth(
  async ({ orgId, userId }, req: NextRequest) => {
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
