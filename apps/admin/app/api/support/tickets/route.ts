/**
 * Platform support tickets raised from the Admin Portal.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * The query itself lives in `@quikit/shared/supportTickets` and is identical in
 * every app; this file only supplies the Admin Portal's auth guard and slug.
 *
 * Guarded by `withMemberAuth`, NOT `withAdminAuth`: raising a support request is
 * a member-level action. An org member who can reach the portal at all — but is
 * not an admin — must still be able to tell us something is wrong. Creation is
 * rate-limited inside `createSupportTicket` (10/hour per user, shared across
 * every app).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withMemberAuth } from "@/lib/api/withMemberAuth";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";

const APP_SLUG = "admin";

export const GET = withMemberAuth(async ({ orgId, userId }, req: NextRequest) => {
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
});

export const POST = withMemberAuth(async ({ orgId, userId }, req: NextRequest) => {
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
});
