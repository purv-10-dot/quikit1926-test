import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { updateRelatedLinkSchema } from "@/lib/validation/release";

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

/** PATCH a related-work row — title/url/status/assignee. Used to fill in a
 * placeholder card created from the template picker, or to update its
 * tracking status/assignee. */
export const PATCH = withOrgAuth<{ id: string; linkId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const link = await db.qtReleaseRelatedLink.findFirst({
      where: { id: params.linkId, releaseId: release.id },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const parsed = updateRelatedLinkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { title, url, status, assigneeId, issueId } = parsed.data;
    const updated = await db.qtReleaseRelatedLink.update({
      where: { id: link.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(url !== undefined ? { url } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(assigneeId !== undefined ? { assigneeId } : {}),
        ...(issueId !== undefined ? { issueId } : {}),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
