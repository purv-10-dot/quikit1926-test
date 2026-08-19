import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

async function loadRelease(id: string, orgId: string) {
  return db.qtRelease.findFirst({
    where: { id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: { id: true, projectId: true, name: true, project: { select: { name: true } } },
  });
}

async function userCanView(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  return !!member;
}

/**
 * Compact per-work-item source data for the "Create release notes" generator
 * — key/title/type/description for every issue linked to this release, plus
 * whether it's linked via a QtIssueRelease row ("linked") vs referenced only
 * from a related-work card ("not linked" filter option has no matching data
 * source here, so the UI's linked/not-linked toggle operates on this single
 * linked set only).
 */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const release = await loadRelease(params.id, orgId);
  if (!release) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (!(await userCanView(userId, orgId, release.projectId))) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const links = await db.qtIssueRelease.findMany({
    where: { releaseId: release.id },
    select: {
      issue: {
        select: { id: true, key: true, title: true, type: true, description: true },
      },
    },
  });

  const items = links
    .map((l) => l.issue)
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  return NextResponse.json({
    success: true,
    data: {
      releaseName: release.name,
      projectName: release.project.name,
      items,
    },
  });
});
