import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";

export const runtime = "nodejs";

/**
 * GET /api/settings/users/search?email=<prefix>
 *
 * Typeahead for the "New User" invite modal. Returns OrgMembers in the
 * active org whose email matches the prefix (case-insensitive substring).
 *
 * A user may already be an OrgMember (joined via another app) without
 * having UserAppAccess for QuikCRM yet. The autocomplete surfaces those
 * users so the admin can grant CRM access in one click.
 *
 * Each row carries `hasQuikCrmAccess` so the UI can:
 *   - Grant CRM access   → POST with linkExistingUserId (no re-create)
 *   - Already in CRM     → disabled / informational
 *
 * Returns at most 10 rows. Query must be ≥2 chars to avoid full dumps.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const q = (new URL(req.url).searchParams.get("email") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const appId = await getQuikCrmAppId();

    const members = await prisma.orgMember.findMany({
      where: {
        orgId: user.orgId,
        user: { email: { contains: q, mode: "insensitive" } },
      },
      select: {
        status: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            ...(appId
              ? { appAccess: { where: { orgId: user.orgId, appId }, select: { id: true } } }
              : {}),
          },
        },
      },
      take: 10,
      orderBy: { user: { email: "asc" } },
    });

    const data = members.map((m) => ({
      userId: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      status: m.status,
      hasQuikCrmAccess:
        appId && Array.isArray((m.user as { appAccess?: { id: string }[] }).appAccess)
          ? ((m.user as { appAccess?: { id: string }[] }).appAccess?.length ?? 0) > 0
          : false,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
