import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { linkWorkItemSchema } from "@/lib/validation/release";

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

/**
 * "Link work item" — attaches a real QtIssue to an EXISTING related-work
 * card (identified by linkId) by setting issueId. The card's own title is
 * untouched — the linked issue's live status/assignee surface alongside it
 * (see the GET include in app/api/releases/[id]/route.ts), it isn't rendered
 * as a separate row or given its own title.
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = linkWorkItemSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const link = await db.qtReleaseRelatedLink.findFirst({
      where: { id: parsed.data.linkId, releaseId: release.id },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Related work item not found" }, { status: 404 });
    }
    const issue = await db.qtIssue.findFirst({
      where: { id: parsed.data.issueId, projectId: release.projectId, isDeleted: false },
      select: { id: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Work item not found" }, { status: 404 });
    }
    const updated = await db.qtReleaseRelatedLink.update({
      where: { id: link.id },
      data: { issueId: issue.id },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
