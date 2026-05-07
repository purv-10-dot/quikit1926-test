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

    const activeSprint = await db.qtSprint.findFirst({
      where: { projectId: sprint.projectId, status: "ACTIVE", isDeleted: false },
      select: { id: true },
    });
    if (activeSprint) {
      return NextResponse.json(
        { success: false, error: "Another sprint is already active" },
        { status: 409 },
      );
    }

    const updated = await db.qtSprint.update({
      where: { id: params.id },
      data: { status: "ACTIVE", startedAt: new Date(), updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
