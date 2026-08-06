/**
 * GET /api/projects/[id]/development
 *
 * Space-level development summary for the Development tab: repos linked to this
 * space, plus recent branches / commits / PRs across the space's work items.
 * Org-scoped, gated by project Board:view (same as the tab).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { computeSpaceDevMetrics } from "@/lib/services/github/space-dev-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    // Issue ids in this space — dev rows are keyed by issueId, so we scope
    // activity to the space by first resolving its (non-deleted) issues.
    const issues = await db.qtIssue.findMany({
      where: { orgId, projectId, isDeleted: false },
      select: { id: true },
    });
    const issueIds = issues.map((i) => i.id);
    const metrics = await computeSpaceDevMetrics(orgId, projectId, issueIds, Date.now());

    const [repos, branches, commits, pullRequests] = await Promise.all([
      db.qtGithubRepo.findMany({
        where: { orgId, projectId, isActive: true },
        select: { repoId: true, repoFullName: true, defaultBranch: true, backfillStatus: true },
        orderBy: { repoFullName: "asc" },
      }),
      issueIds.length
        ? db.qtDevBranch.findMany({
            where: { orgId, issueId: { in: issueIds } },
            select: { id: true, name: true, url: true, repoFullName: true, issueId: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 25,
          })
        : [],
      issueIds.length
        ? db.qtDevCommit.findMany({
            where: { orgId, issueId: { in: issueIds } },
            select: { id: true, sha: true, message: true, url: true, repoFullName: true, issueId: true, committedAt: true },
            orderBy: { committedAt: "desc" },
            take: 25,
          })
        : [],
      issueIds.length
        ? db.qtDevPullRequest.findMany({
            where: { orgId, issueId: { in: issueIds } },
            select: { id: true, number: true, title: true, state: true, url: true, repoFullName: true, issueId: true, updatedAtGh: true, authorName: true },
            orderBy: { updatedAtGh: "desc" },
            take: 25,
          })
        : [],
    ]);

    return NextResponse.json({
      success: true,
      data: {
        repos,
        branches,
        commits,
        pullRequests,
        counts: {
          repos: repos.length,
          branches: branches.length,
          commits: commits.length,
          pullRequests: pullRequests.length,
        },
        metrics,
      },
    });
  },
  { paramKey: "id", requirePermission: { resource: "Board", action: "view" } },
);
