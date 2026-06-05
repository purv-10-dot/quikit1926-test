import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { recordIssueEvent } from "@/lib/services/issueHistory";

const LINK_TYPES = ["RELATES_TO"] as const;

const LINK_TYPE_LABELS: Record<(typeof LINK_TYPES)[number], string> = {
  RELATES_TO: "relates to",
};

const createLinkSchema = z.object({
  targetIssueId: z.string().min(1),
  type: z.enum(LINK_TYPES).default("RELATES_TO"),
});

/**
 * Verify the caller can see this source issue (project member or tenant admin)
 * and return the issue. Used by both GET and POST.
 */
async function loadAccessibleIssue(
  orgId: string,
  userId: string,
  issueId: string,
) {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId: orgId, isDeleted: false },
    select: { id: true, projectId: true, orgId: true },
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
    // Outgoing only — when "A relates to B" is created, we surface it on A.
    // The target side is rendered separately via incomingLinks if we ever
    // want a bidirectional view, but Jira-style "relates to" is symmetric
    // semantically so showing one side is enough.
    const links = await db.qtIssueLink.findMany({
      where: { orgId: orgId, sourceIssueId: params.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        createdAt: true,
        targetIssue: {
          select: {
            id: true,
            key: true,
            title: true,
            type: true,
            priority: true,
            assigneeId: true,
            statusId: true,
            status: {
              select: { id: true, name: true, color: true, category: true },
            },
          },
        },
      },
    });
    return NextResponse.json({ success: true, data: links });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const parsed = createLinkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }
    if (parsed.data.targetIssueId === params.id) {
      return NextResponse.json(
        { success: false, error: "Cannot link an issue to itself" },
        { status: 400 },
      );
    }
    // Target must live in the same tenant. We don't require the same project
    // — cross-project "relates to" is a useful pattern.
    const target = await db.qtIssue.findFirst({
      where: { id: parsed.data.targetIssueId, orgId: orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: "Target issue not found" }, { status: 404 });
    }
    const existing = await db.qtIssueLink.findFirst({
      where: {
        sourceIssueId: params.id,
        targetIssueId: target.id,
        type: parsed.data.type,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Link already exists" },
        { status: 409 },
      );
    }
    const created = await db.qtIssueLink.create({
      data: {
        orgId: orgId,
        projectId: issue.projectId,
        sourceIssueId: params.id,
        targetIssueId: target.id,
        type: parsed.data.type,
        createdBy: userId,
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
        targetIssue: {
          select: {
            id: true,
            key: true,
            title: true,
            type: true,
            priority: true,
            assigneeId: true,
            statusId: true,
            status: {
              select: { id: true, name: true, color: true, category: true },
            },
          },
        },
      },
    });
    void recordIssueEvent({
      orgId,
      projectId: issue.projectId,
      issueId: issue.id,
      userId,
      field: "Link",
      oldValue: null,
      newValue: `This work item ${LINK_TYPE_LABELS[parsed.data.type]} ${created.targetIssue.key}`,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  },
);
