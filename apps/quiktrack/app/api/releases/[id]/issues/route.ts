import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { addWorkItemsSchema } from "@/lib/validation/release";

async function loadRelease(id: string, orgId: string) {
  return db.qtRelease.findFirst({
    where: { id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: { id: true, projectId: true },
  });
}

async function userCanEdit(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "Release", "update");
}

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = addWorkItemsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    // Only attach issues that actually belong to this project.
    const validIssues = await db.qtIssue.findMany({
      where: { id: { in: parsed.data.issueIds }, projectId: release.projectId, isDeleted: false },
      select: { id: true },
    });
    if (validIssues.length === 0) {
      return NextResponse.json({ success: false, error: "No valid work items to add" }, { status: 400 });
    }
    await db.qtIssueRelease.createMany({
      data: validIssues.map((i) => ({ releaseId: release.id, issueId: i.id, addedBy: userId })),
      skipDuplicates: true,
    });
    return NextResponse.json({ success: true, data: { added: validIssues.length } }, { status: 201 });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const issueId = new URL(req.url).searchParams.get("issueId");
    if (!issueId) {
      return NextResponse.json({ success: false, error: "issueId is required" }, { status: 400 });
    }
    await db.qtIssueRelease.deleteMany({ where: { releaseId: release.id, issueId } });
    return NextResponse.json({ success: true });
  },
);
