import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { captureCommittedSnapshot } from "@/lib/reports/sprint-snapshot";

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

    if (
      !(await hasAdminAccess(userId, orgId)) &&
      !(await userCanInProject(userId, orgId, sprint.projectId, "Sprint", "update"))
    ) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    // Parallel sprints allowed — Jira's "Parallel Sprints" board setting
    // permits multiple ACTIVE sprints per project, and QuikTrack mirrors
    // that. Teams that want the stricter "one active" workflow can simply
    // not start more than one at a time. (Earlier this route rejected
    // with "Another sprint is already active" — that restriction has been
    // lifted; the Jira importer also writes whatever active set the source
    // reported.)
    // Flip to ACTIVE and freeze the velocity "committed" scope in one txn, so
    // the sprint can never be active without a snapshot of what it committed to.
    const updated = await db.$transaction(async (tx) => {
      const s = await tx.qtSprint.update({
        where: { id: params.id },
        data: { status: "ACTIVE", startedAt: new Date(), updatedBy: userId },
      });
      await captureCommittedSnapshot(tx, {
        orgId,
        projectId: sprint.projectId,
        sprintId: params.id,
      });
      return s;
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
