import { NextResponse } from "next/server";
import { db as dbCentral } from "@quikit/database";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";

const auth = withOrgAuthForResource("construction.users");

/**
 * GET /api/settings/users/search?email=<prefix>
 *
 * Typeahead for the "Add New User" panel. Returns OrgMembers in the
 * active org whose email matches the prefix (case-insensitive substring).
 *
 * A user may already be an OrgMember (joined via another app — e.g.
 * QuikScale) without having UserAppAccess for QuikInfra yet. The autocomplete
 * surfaces those users so the admin can grant quikinfra access in one
 * click instead of typing details fresh.
 *
 * Each row carries `hasQuikInfraAccess` so the UI can:
 *   - "Add to QuikInfra" → POST with linkExistingUserId
 *   - "Already in QuikInfra" → disabled / informational
 *
 * Returns at most 10 rows. Empty query → empty array (don't dump the
 * whole org).
 */
export const GET = auth.manage(
  async ({ orgId }, req) => {
    const q = (req.nextUrl.searchParams.get("email") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const appId = await getQuikInfraAppId();

    const members = (await dbCentral.orgMember.findMany({
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
    })) as Array<{
      id: string;
      status: string;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        avatar: string | null;
        appAccess?: Array<{ id: string }>;
      };
    }>;

    const data = members.map((m) => ({
      userId: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      avatar: m.user.avatar,
      status: m.status,
      hasQuikInfraAccess: Array.isArray(m.user.appAccess)
        ? m.user.appAccess.length > 0
        : false,
    }));

    return NextResponse.json({ success: true, data });
  },
  { fallbackErrorMessage: "Failed to search users" },
);
