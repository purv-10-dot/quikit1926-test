import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canWriteGroups, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { moveTaskSchema } from "@/lib/validation/group";
import { moveTaskToGroup } from "@/lib/services/groupService";
import {
  recordIssueChanges,
  selectIssueHistorySnapshot,
} from "@/lib/services/issueHistory";

/**
 * POST /api/groups/move-task
 * Cross-group OR within-group reorder. Critically, this NEVER touches
 * `statusId` — Rule 2: "Group change does not change status".
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = moveTaskSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 400 },
    );
  }
  const { issueId, toGroupId, toIndex } = parsed.data;

  const before = await db.qtIssue.findFirst({
    where: { id: issueId, orgId, isDeleted: false },
    select: {
      id: true,
      projectId: true,
      key: true,
      ...selectIssueHistorySnapshot,
    },
  });
  if (!before) {
    return NextResponse.json(
      { success: false, error: "Issue not found" },
      { status: 404 },
    );
  }
  const access = await loadProjectAccess(orgId, userId, before.projectId);
  if (!access || !(await canWriteGroups(access, userId, orgId))) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  if (toGroupId) {
    const target = await db.qtTaskGroup.findFirst({
      where: {
        id: toGroupId,
        projectId: before.projectId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Target group not found" },
        { status: 404 },
      );
    }
  }

  await moveTaskToGroup({
    orgId,
    projectId: before.projectId,
    issueId,
    toGroupId,
    toIndex,
  });

  const after = await db.qtIssue.findUnique({
    where: { id: issueId },
    select: selectIssueHistorySnapshot,
  });
  if (after) {
    void recordIssueChanges({
      orgId,
      projectId: before.projectId,
      issueId: before.id,
      userId,
      before,
      after,
    });
  }

  return NextResponse.json({
    success: true,
    data: { id: issueId, groupId: toGroupId, orderInGroup: toIndex },
  });
});
