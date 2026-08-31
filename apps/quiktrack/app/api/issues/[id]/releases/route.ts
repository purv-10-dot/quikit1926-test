import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

const setReleasesSchema = z.object({
  releaseIds: z.array(z.string().min(1)),
});

async function loadAccessibleIssue(orgId: string, userId: string, issueId: string) {
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

/** GET the release ids this issue currently belongs to (Jira "Fix version(s)"). */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const issue = await loadAccessibleIssue(orgId, userId, params.id);
  if (!issue) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const links = await db.qtIssueRelease.findMany({
    where: { issueId: params.id },
    select: { releaseId: true },
  });
  return NextResponse.json({ success: true, data: links.map((l) => l.releaseId) });
});

/**
 * PUT replaces the full set of releases this issue belongs to — simplest
 * contract for a multi-select "Fix versions" field (the picker always sends
 * its complete current selection).
 */
export const PUT = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const issue = await loadAccessibleIssue(orgId, userId, params.id);
  if (!issue) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const parsed = setReleasesSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // Only releases that belong to the issue's own project are valid targets.
  const validReleases = parsed.data.releaseIds.length
    ? await db.qtRelease.findMany({
        where: { id: { in: parsed.data.releaseIds }, projectId: issue.projectId, isDeleted: false },
        select: { id: true },
      })
    : [];
  const validIds = new Set(validReleases.map((r) => r.id));

  await db.$transaction([
    db.qtIssueRelease.deleteMany({ where: { issueId: issue.id } }),
    ...(validIds.size > 0
      ? [
          db.qtIssueRelease.createMany({
            data: Array.from(validIds).map((releaseId) => ({
              releaseId,
              issueId: issue.id,
              addedBy: userId,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ success: true, data: Array.from(validIds) });
});
