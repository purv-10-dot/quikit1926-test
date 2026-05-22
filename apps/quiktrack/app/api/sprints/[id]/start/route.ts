import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const sprint = await db.qtSprint.findFirst({
      where: {
        id: params.id,
        isDeleted: false,
        project: { orgId: orgId, isDeleted: false },
      },
      select: { id: true, projectId: true, status: true },
    });
    if (!sprint) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (sprint.status !== "PLANNING") {
      return NextResponse.json(
        { success: false, error: `Sprint already ${sprint.status}` },
        { status: 409 },
      );
    }

    const member = await db.qtProjectMember.findFirst({
      where: { projectId: sprint.projectId, userId, isDeleted: false },
      select: { role: true },
    });
    const tenantAdmin = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
    if (!isAdmin && (!member || member.role === "VIEWER")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Parallel sprints allowed — Jira's "Parallel Sprints" board setting
    // permits multiple ACTIVE sprints per project, and QuikTrack mirrors
    // that. Teams that want the stricter "one active" workflow can simply
    // not start more than one at a time. (Earlier this route rejected
    // with "Another sprint is already active" — that restriction has been
    // lifted; the Jira importer also writes whatever active set the source
    // reported.)
    const updated = await db.qtSprint.update({
      where: { id: params.id },
      data: { status: "ACTIVE", startedAt: new Date(), updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
