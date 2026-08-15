import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { actApproverSchema } from "@/lib/validation/release";

async function loadRelease(id: string, orgId: string) {
  return db.qtRelease.findFirst({
    where: { id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: { id: true, projectId: true },
  });
}

async function userCanManage(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "ReleaseApprover", "delete");
}

export const DELETE = withOrgAuth<{ id: string; approverId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanManage(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    await db.qtReleaseApprover.deleteMany({
      where: { id: params.approverId, releaseId: release.id },
    });
    return NextResponse.json({ success: true });
  },
);

/**
 * An approver acts on THEIR OWN row — approve / request changes, with an
 * optional comment. This is an ownership check (approver.userId === caller),
 * not a permission grant, same pattern as IssueComment edit/delete.
 */
export const PATCH = withOrgAuth<{ id: string; approverId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const approver = await db.qtReleaseApprover.findFirst({
      where: { id: params.approverId, releaseId: release.id },
    });
    if (!approver) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (approver.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "You can only act on your own approval." },
        { status: 403 },
      );
    }
    const parsed = actApproverSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const updated = await db.qtReleaseApprover.update({
      where: { id: approver.id },
      data: {
        status: parsed.data.status,
        comment: parsed.data.comment ?? null,
        actedAt: parsed.data.status === "PENDING" ? null : new Date(),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
