import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";

export const runtime = "nodejs";

/**
 * GET /api/settings/users/search?email=<prefix>
 *
 * Typeahead for the "New User" panel. Returns OrgMembers in the active org
 * whose email matches the prefix (case-insensitive substring).
 *
 * A user may already be an OrgMember (joined via another app, or assigned a
 * role via the admin portal) without having UserAppAccess for CredFlow yet.
 * The autocomplete surfaces those users so an admin can grant CredFlow access
 * in one click (POST with linkExistingUserId) instead of typing details fresh.
 *
 * Each row carries `hasCredflowAccess` so the UI can:
 *   - "Add to CredFlow"     → POST with linkExistingUserId
 *   - "Already in CredFlow" → disabled / informational
 *
 * Returns at most 10 rows. Query under 2 chars → empty array (don't dump the
 * whole org).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "users", "view");

    const q = (req.nextUrl.searchParams.get("email") ?? "").trim();
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
        id: true,
        status: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            appAccess: appId
              ? { where: { orgId: user.orgId, appId }, select: { id: true } }
              : false,
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
      hasCredflowAccess: Array.isArray(
        (m.user as { appAccess?: Array<{ id: string }> }).appAccess,
      )
        ? (m.user as { appAccess?: Array<{ id: string }> }).appAccess!.length > 0
        : false,
    }));

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}