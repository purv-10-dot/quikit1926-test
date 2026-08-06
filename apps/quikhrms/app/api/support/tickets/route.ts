/**
 * Platform support tickets raised from QuikHRMS.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * NOT wrapped in HRMS's `withAuth`, deliberately. That wrapper resolves the
 * central identity down to an `Employee.id` and hands it to the handler as
 * `ctx.userId` — correct for every HRMS table, wrong here. `SupportTicket.userId`
 * is the CENTRAL `auth.User.id`: it's what the super-admin triage queue joins on
 * to name the requester, and what makes one user's tickets line up across every
 * app. Passing an Employee.id would produce tickets attributed to nobody.
 *
 * So this route reads the central session directly, exactly as
 * `/api/session/validate` does. `getServerSession` still enforces the session,
 * and an org must be selected, so this is not an open endpoint.
 *
 * Also deliberately NOT permission-gated: a user locked out of a module must
 * still be able to report that they are locked out. Creation is rate-limited
 * inside `createSupportTicket` (10/hour per user, shared across every app).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";

const APP_SLUG = "quikhrms";

/** Central identity for the caller, or the response to return instead. */
async function requireCentralIdentity(): Promise<
  { ok: true; userId: string; orgId: string } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const orgId = session.user.orgId;
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "No active membership" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: session.user.id, orgId };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCentralIdentity();
    if (!auth.ok) return auth.response;

    const query = parseSupportListQuery(req.nextUrl.searchParams);
    const result = await listSupportTickets({
      orgId: auth.orgId,
      userId: auth.userId,
      ...query,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      data: result.data.tickets,
      meta: result.data.meta,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load support tickets";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCentralIdentity();
    if (!auth.ok) return auth.response;

    const result = await createSupportTicket({
      orgId: auth.orgId,
      userId: auth.userId,
      appSlug: APP_SLUG,
      body: await req.json().catch(() => null),
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit support request";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
