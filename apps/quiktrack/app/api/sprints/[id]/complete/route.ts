import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
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
    if (sprint.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: `Sprint is ${sprint.status}, must be ACTIVE` },
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

    const body: { moveOpenTo?: string | null; newSprintName?: string } = await req
      .json()
      .catch(() => ({}));
    // moveOpenTo:
    //   undefined / null / "backlog" → backlog (sprintId = null)
    //   "new"                         → create a new sprint and move open items there
    //   <sprintId>                    → move open items into that existing PLANNING sprint
    const moveOpenTo = body.moveOpenTo;
    const newSprintName = body.newSprintName?.trim() || "New sprint";

    const updated = await db.$transaction(async (tx) => {
      const doneStatuses = await tx.qtIssueStatus.findMany({
        where: { projectId: sprint.projectId, category: "DONE", isDeleted: false },
        select: { id: true },
      });
      const doneIds = doneStatuses.map((s) => s.id);

      let destinationSprintId: string | null = null;
      if (moveOpenTo === "new") {
        const created = await tx.qtSprint.create({
          data: {
            projectId: sprint.projectId,
            name: newSprintName,
            status: "PLANNING",
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        });
        destinationSprintId = created.id;
      } else if (moveOpenTo && moveOpenTo !== "backlog") {
        const dest = await tx.qtSprint.findFirst({
          where: {
            id: moveOpenTo,
            projectId: sprint.projectId,
            isDeleted: false,
            status: { not: "COMPLETED" },
          },
          select: { id: true },
        });
        if (!dest) throw new Error("Invalid destination sprint");
        destinationSprintId = dest.id;
      }

      await tx.qtIssue.updateMany({
        where: {
          sprintId: params.id,
          isDeleted: false,
          ...(doneIds.length ? { statusId: { notIn: doneIds } } : {}),
        },
        data: { sprintId: destinationSprintId, updatedBy: userId },
      });

      return tx.qtSprint.update({
        where: { id: params.id },
        data: { status: "COMPLETED", completedAt: new Date(), updatedBy: userId },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  },
);
