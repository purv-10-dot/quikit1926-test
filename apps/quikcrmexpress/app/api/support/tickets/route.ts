/**
 * Platform support tickets raised from QuikCRMExpress.
 *
 * The ticket store, validation and list/query parsing all live in
 * @quikit/shared/supportTickets and are shared verbatim by every app; this file
 * only supplies QuikCRMExpress's auth guard and slug.
 *
 * Ported from apps/quiktrack/app/api/support/tickets/route.ts. The guard is
 * this app's `requireApiUser` rather than quiktrack's local `withOrgAuth`
 * wrapper — that wrapper carries PAT/API-token/feature-gate machinery built on
 * files this app does not have, and `requireApiUser` is the established guard
 * for all 240 of this app's authenticated routes.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

const APP_SLUG = "quikcrmexpress";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const query = parseSupportListQuery(req.nextUrl.searchParams);
    const result = await listSupportTickets({
      orgId: user.orgId,
      userId: user.userId,
      ...query,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({
      success: true,
      data: result.data.tickets,
      meta: result.data.meta,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const result = await createSupportTicket({
      orgId: user.orgId,
      userId: user.userId,
      appSlug: APP_SLUG,
      body: await req.json().catch(() => null),
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(
      { success: true, data: result.data },
      { status: result.status },
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
