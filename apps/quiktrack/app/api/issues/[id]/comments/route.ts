import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";

const createCommentSchema = z.object({
  body: z.string().min(1).max(20_000),
});

async function loadAccessibleIssue(
  orgId: string,
  userId: string,
  issueId: string,
) {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId: orgId, isDeleted: false },
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

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const comments = await db.qtIssueComment.findMany({
      where: { orgId: orgId, issueId: params.id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        body: true,
        createdAt: true,
        editedAt: true,
      },
    });
    const userIds = Array.from(new Set(comments.map((c) => c.userId)));
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
    const data = comments.map((c) => ({
      ...c,
      user: userById.get(c.userId) ?? null,
    }));
    return NextResponse.json({ success: true, data });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin && !(await userCanInProject(userId, orgId, issue.projectId, "IssueComment", "create"))) {
      return forbidden();
    }
    const parsed = createCommentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const created = await db.qtIssueComment.create({
      data: {
        orgId: orgId,
        projectId: issue.projectId,
        issueId: issue.id,
        userId,
        body: parsed.data.body,
      },
      select: {
        id: true,
        userId: true,
        body: true,
        createdAt: true,
        editedAt: true,
      },
    });
    const author = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
      },
    });
    return NextResponse.json(
      { success: true, data: { ...created, user: author } },
      { status: 201 },
    );
  },
);
