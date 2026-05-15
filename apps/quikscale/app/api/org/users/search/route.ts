import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikScaleAppId } from "@/lib/api/permissions";

const auth = withOrgAuthForResource("orgSetup.users", "User");

/**
 * GET /api/org/users/search?email=<prefix>
 *
 * Typeahead for the "Add New User" panel. Returns OrgMembers in the
 * active org whose email matches the prefix (case-insensitive substring).
 *
 * A user may already be an OrgMember (joined via another app — e.g.
 * QuikVC) without having UserAppAccess for QuikScale yet. The autocomplete
 * surfaces those users so the admin can grant quikscale access in one
 * click instead of typing details fresh.
 *
 * Each row carries `hasQuikScaleAccess` so the UI can:
 *   - "Add to QuikScale" → POST with linkExistingUserId
 *   - "Already in QuikScale" → disabled / informational
 *
 * Returns at most 10 rows. Empty query → empty array (don't dump the
 * whole org).
 */
export const GET = auth.view(
  async ({ orgId }, req) => {
    const q = (req.nextUrl.searchParams.get("email") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const appId = await getQuikScaleAppId();

    const members = await db.orgMember.findMany({
      where: {
        orgId,
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
            avatar: true,
            appAccess: appId
              ? { where: { orgId, appId }, select: { id: true } }
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
      avatar: m.user.avatar,
      status: m.status,
      hasQuikScaleAccess: Array.isArray((m.user as { appAccess?: Array<{ id: string }> }).appAccess)
        ? ((m.user as { appAccess?: Array<{ id: string }> }).appAccess!.length > 0)
        : false,
    }));

    return NextResponse.json({ success: true, data });
  },
  { fallbackErrorMessage: "Failed to search users" },
);
