import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { updateSprintSchema } from "@/lib/validation/sprint";

async function loadSprint(id: string, orgId: string) {
  return db.qtSprint.findFirst({
    where: { id, isDeleted: false, project: { orgId: orgId, isDeleted: false } },
    select: { id: true, projectId: true, status: true, name: true },
  });
}

// Global admins bypass; everyone else needs Sprint:update via their role.
async function userCanEdit(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "Sprint", "update");
}

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const sprint = await loadSprint(params.id, orgId);
    if (!sprint) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, sprint.projectId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = updateSprintSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { name, goal, startDate, endDate } = parsed.data;
    const updated = await db.qtSprint.update({
      where: { id: sprint.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(goal !== undefined ? { goal: goal || null } : {}),
        ...(startDate !== undefined
          ? { startDate: startDate ? new Date(startDate) : null }
          : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        updatedBy: userId,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const sprint = await loadSprint(params.id, orgId);
    if (!sprint) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, sprint.projectId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (sprint.status === "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Cannot delete an active sprint" },
        { status: 409 },
      );
    }
    // Soft-delete + detach issues so they fall back to the backlog.
    await db.$transaction([
      db.qtIssue.updateMany({
        where: { sprintId: sprint.id, isDeleted: false },
        data: { sprintId: null, updatedBy: userId },
      }),
      db.qtSprint.update({
        where: { id: sprint.id },
        data: { isDeleted: true, updatedBy: userId },
      }),
    ]);
    return NextResponse.json({ success: true });
  },
);
