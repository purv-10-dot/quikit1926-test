import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";
import { addRemoteLinkSchema } from "@/lib/validation/remoteLink";

async function loadAccessibleIssue(
  orgId: string,
  userId: string,
  issueId: string,
) {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId: orgId, isDeleted: false },
    select: { id: true, projectId: true },
  });
  if (!issue) return null;
  const access = await db.qtProjectMember.findFirst({
    where: { projectId: issue.projectId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!access && !(await hasAdminAccess(userId, orgId))) return null;
  return issue;
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const links = await db.qtRemoteLink.findMany({
      where: { orgId: orgId, issueId: params.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, url: true, title: true, type: true, metadata: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: links });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (
      !(await hasAdminAccess(userId, orgId)) &&
      !(await userCanInProject(userId, orgId, issue.projectId, "Issue", "update"))
    ) {
      return forbidden();
    }
    const parsed = addRemoteLinkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const created = await db.qtRemoteLink.create({
      data: {
        orgId: orgId,
        projectId: issue.projectId,
        issueId: issue.id,
        url: parsed.data.url,
        title: parsed.data.title,
        type: parsed.data.type,
      },
      select: { id: true, url: true, title: true, type: true, metadata: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  },
);
