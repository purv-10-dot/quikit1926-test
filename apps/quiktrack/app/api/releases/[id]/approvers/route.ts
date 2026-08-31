import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { addApproverSchema } from "@/lib/validation/release";

async function loadRelease(id: string, orgId: string) {
  return db.qtRelease.findFirst({
    where: { id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: { id: true, projectId: true },
  });
}

async function userCanManage(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "ReleaseApprover", "create");
}

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanManage(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = addApproverSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: release.projectId, userId: parsed.data.userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "User is not a member of this project" }, { status: 400 });
    }
    const approver = await db.qtReleaseApprover.upsert({
      where: { releaseId_userId: { releaseId: release.id, userId: parsed.data.userId } },
      create: { releaseId: release.id, userId: parsed.data.userId, createdBy: userId },
      update: {},
    });
    return NextResponse.json({ success: true, data: approver }, { status: 201 });
  },
);
