import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";

/**
 * Projects the caller may report on — powers the "Project Name" filter across
 * the Reports pages. Access model matches the report data routes:
 *   - org admins  → every (non-deleted) project in the org;
 *   - Space Admins → only the projects they administer;
 *   - everyone else → none.
 * Using the general `/api/projects` here leaked member-only projects into the
 * filter even though the report data excluded them.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
    const isAdmin = await hasAdminAccess(userId, orgId);
    const where = isAdmin
      ? { orgId, isDeleted: false }
      : {
          orgId,
          isDeleted: false,
          // `id: { in: [] }` returns nothing — the correct empty result for a
          // non-admin with no Space Admin projects.
          id: { in: await spaceAdminProjectIds(userId, orgId) },
        };

    const projects = await db.qtProject.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
