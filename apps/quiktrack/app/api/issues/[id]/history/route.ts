import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Read-only history feed for an issue. Rows are written by the various PATCH
 * routes when they detect a tracked-field change (Stage 2 of the activity
 * feature wires those producers — for now this returns whatever's been
 * written so far, which on a fresh model means an empty list).
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!access && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const rows = await db.qtIssueHistory.findMany({
      where: { orgId: orgId, issueId: params.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        actorType: true,
      },
    });
    const userIds = Array.from(
      new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id))),
    );
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u] as const));
    const data = rows.map((r) => ({
      ...r,
      user: r.userId ? userById.get(r.userId) ?? null : null,
    }));
    return NextResponse.json({ success: true, data });
  },
);
