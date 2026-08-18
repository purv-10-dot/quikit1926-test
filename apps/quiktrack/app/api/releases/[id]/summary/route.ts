import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * GET /api/releases/[id]/summary — progress panel data: related-work count,
 * work-items count, and Done/In-Progress/To-Do breakdown across the
 * release's linked issues (reuses the same statusId → QtIssueStatus.category
 * bucketing as the sprint summary/list endpoints).
 */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const release = await db.qtRelease.findFirst({
    where: { id: params.id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: { id: true, projectId: true },
  });
  if (!release) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!isAdmin) {
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: release.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
  }

  const [relatedWorkCount, links] = await Promise.all([
    db.qtReleaseRelatedLink.count({ where: { releaseId: release.id } }),
    db.qtIssueRelease.findMany({
      where: { releaseId: release.id },
      select: { issue: { select: { statusId: true, isDeleted: true } } },
    }),
  ]);

  const activeLinks = links.filter((l) => !l.issue.isDeleted);
  const statusIds = Array.from(new Set(activeLinks.map((l) => l.issue.statusId)));
  const statuses = statusIds.length
    ? await db.qtIssueStatus.findMany({
        where: { id: { in: statusIds } },
        select: { id: true, category: true },
      })
    : [];
  const catById = new Map(statuses.map((s) => [s.id, s.category] as const));

  let done = 0;
  let inProgress = 0;
  let todo = 0;
  for (const l of activeLinks) {
    const cat = catById.get(l.issue.statusId) ?? "BACKLOG";
    if (cat === "DONE") done += 1;
    else if (cat === "IN_PROGRESS") inProgress += 1;
    else todo += 1;
  }

  return NextResponse.json({
    success: true,
    data: {
      relatedWorkCount,
      workItemCount: activeLinks.length,
      counts: { done, inProgress, todo },
    },
  });
});
