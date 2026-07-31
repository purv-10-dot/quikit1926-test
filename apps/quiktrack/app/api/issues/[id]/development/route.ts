/**
 * GET /api/issues/[id]/development
 *
 * Development artifacts (branches / commits / pull requests) linked to a work
 * item, for the issue view's Development section. Org-scoped, with the same
 * access gate the other issue sub-routes use: the issue must exist in this org
 * and the caller must be a member of its project (or a tenant admin).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issueId = params.id;

    const issue = await db.qtIssue.findFirst({
      where: { id: issueId, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const member = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const [branches, commits, pullRequests] = await Promise.all([
      db.qtDevBranch.findMany({
        where: { orgId, issueId },
        select: { id: true, name: true, url: true, repoFullName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      db.qtDevCommit.findMany({
        where: { orgId, issueId },
        select: {
          id: true, sha: true, message: true, authorName: true, url: true,
          repoFullName: true, committedAt: true,
        },
        orderBy: { committedAt: "desc" },
        take: 50,
      }),
      db.qtDevPullRequest.findMany({
        where: { orgId, issueId },
        select: {
          id: true, number: true, title: true, state: true, url: true,
          authorName: true, repoFullName: true, updatedAtGh: true,
        },
        orderBy: { updatedAtGh: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { branches, commits, pullRequests },
    });
  },
  { fallbackErrorMessage: "Failed to load development data" },
);
