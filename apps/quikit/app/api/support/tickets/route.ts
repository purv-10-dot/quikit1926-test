/**
 * Platform support tickets raised from the QuikIT launcher.
 *
 *   GET  — the caller's OWN tickets
 *   POST — raise a new ticket (floating Support panel)
 *
 * This is the USER-facing side of support, mounted for the launcher. The
 * super-admin triage queue that reads every org's tickets is a different
 * surface entirely — `/api/super/support-tickets`, gated by
 * `withSuperAdminAuth`.
 *
 * The launcher is where a user lands when an app won't let them in, so this
 * endpoint matters more here than anywhere: it is the one place someone with no
 * app access at all can still reach a human. Guarded only by session + a
 * selected org, deliberately.
 *
 * Creation is rate-limited inside `createSupportTicket` (10/hour per user,
 * shared across every app).
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

const APP_SLUG = "quikit";

/** Central identity for the caller, or the response to return instead. */
async function requireIdentity(): Promise<
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
        { success: false, error: "No organisation selected" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: session.user.id, orgId };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireIdentity();
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
    const auth = await requireIdentity();
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
