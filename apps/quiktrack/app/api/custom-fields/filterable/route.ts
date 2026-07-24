import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { listFilterableFieldsAcrossProjects } from "@/lib/services/customFields";

/**
 * GET /api/custom-fields/filterable
 *
 * Cross-project catalog of filterable custom fields for the saved-filters
 * "More filters" dropdown — so JPD/discovery fields (Theme, Impact, Effort,
 * Value, …) show by DEFAULT without first picking a project.
 *
 * Fields are project-scoped ("space") plus org-global, so we aggregate across
 * every project the caller can see (all projects for admins, member projects
 * otherwise) and dedupe by (name, type). See
 * `listFilterableFieldsAcrossProjects` for how per-project copies collapse into
 * one entry whose id filters across all of them.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
    const isAdmin = await hasAdminAccess(userId, orgId);

    let projectIds: string[] | null = null;
    if (!isAdmin) {
      const projects = await db.qtProject.findMany({
        where: { orgId, isDeleted: false, members: { some: { userId, isDeleted: false } } },
        select: { id: true },
      });
      projectIds = projects.map((p) => p.id);
    }

    const data = await listFilterableFieldsAcrossProjects({ orgId, projectIds });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
