import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

async function loadAccessibleIssue(
  orgId: string,
  userId: string,
  issueId: string,
) {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId, isDeleted: false },
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
    const rows = await db.qtIssueAttachment.findMany({
      where: { orgId, issueId: params.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        sourceSystem: true,
        uploadedBy: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, data: rows });
  },
);
