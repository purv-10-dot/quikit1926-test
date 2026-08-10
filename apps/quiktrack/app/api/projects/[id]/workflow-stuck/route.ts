import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * GET /api/projects/[id]/workflow-stuck
 * "Stuck" issues (WF-7.3): sitting in a DONE-category status but with NO
 * resolution set (resolutionId IS NULL). This is the config smell the spec
 * calls out — an issue that looks finished on the board but isn't resolved, so
 * "open work" (resolution IS NULL) still counts it. Surfaces them for cleanup.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    // Which of this project's statuses are DONE-category?
    const doneStatuses = await db.qtIssueStatus.findMany({
      where: { projectId, isDeleted: false, category: "DONE" },
      select: { id: true },
    });
    const doneStatusIds = doneStatuses.map((s) => s.id);
    if (doneStatusIds.length === 0) {
      return NextResponse.json({ success: true, data: { count: 0, issues: [] } });
    }

    const issues = await db.qtIssue.findMany({
      where: {
        projectId,
        isDeleted: false,
        statusId: { in: doneStatusIds },
        resolutionId: null, // open == unresolved
      },
      select: { id: true, key: true, title: true, statusId: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      success: true,
      data: { count: issues.length, issues },
    });
  },
  { paramKey: "id" },
);
