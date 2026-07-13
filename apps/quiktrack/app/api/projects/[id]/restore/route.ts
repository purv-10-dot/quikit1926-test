import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, forbidden } from "@/lib/api/permissions";

/**
 * Restore a trashed project (POST /api/projects/:id/restore).
 *
 * This lives in its own route rather than the shared PATCH because
 * `withProjectAccess` filters `isDeleted: false` — a trashed project 404s
 * there, so it can't be reached by the normal edit path. We gate with the org
 * auth wrapper + an explicit admin check instead.
 *
 * ADMIN-ONLY, mirroring the trash (DELETE) gate: only org owners/admins and
 * QuikTrack app-admins may recover a project. Restoring also flips the project
 * back to "active" so it reappears in the default list (it was necessarily not
 * "archived" while trashed — the two states are independent, and "active" is
 * the sensible landing state).
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await hasAdminAccess(userId, orgId))) return forbidden();

    const projectId = params?.id;
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project id missing" },
        { status: 400 },
      );
    }

    const project = await db.qtProject.findFirst({
      where: { id: projectId, orgId, isDeleted: true },
      select: { id: true },
    });
    if (!project) {
      // Either it doesn't exist in this org or it isn't in the trash.
      return NextResponse.json(
        { success: false, error: "Project not found in trash" },
        { status: 404 },
      );
    }

    await db.qtProject.update({
      where: { id: projectId },
      data: { isDeleted: false, status: "active", updatedBy: userId },
    });

    return NextResponse.json({ success: true, data: { id: projectId } });
  },
);
