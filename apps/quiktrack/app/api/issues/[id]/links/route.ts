import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { recordIssueEvent } from "@/lib/services/issueHistory";
import { resolveIssueIdOrKey } from "@/lib/mcp/resolveIssue";

/* `[id]` and `targetIssueId` both accept a cuid or an issue key — see the
 * resolution note in app/api/issues/[id]/route.ts.
 *
 * BOTH sides must be resolved before they are used, for two reasons specific
 * to this route:
 *
 *   • `sourceIssueId` is WRITTEN to QtIssueLink. An unresolved key stored in
 *     a cuid foreign-key column is silent data corruption — the row points at
 *     nothing and no constraint catches it.
 *   • The self-link guard compares the two arguments. Comparing a key against
 *     a cuid lets an issue link to itself whenever the caller spells the two
 *     sides differently, so the comparison must be between resolved ids.
 */
const LINK_TYPES = ["RELATES_TO"] as const;

const LINK_TYPE_LABELS: Record<(typeof LINK_TYPES)[number], string> = {
  RELATES_TO: "relates to",
};

const createLinkSchema = z.object({
  targetIssueId: z.string().min(1),
  type: z.enum(LINK_TYPES).default("RELATES_TO"),
});

/**
 * Verify the caller can see the project an already-resolved issue lives in
 * (project member or tenant admin). Used by both GET and POST.
 *
 * Takes the projectId rather than re-fetching the issue: `resolveIssueIdOrKey`
 * already returned it, and fetching the same row twice per request bought
 * nothing.
 */
async function canAccessProject(
  orgId: string,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const access = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  if (access) return true;
  return hasAdminAccess(userId, orgId);
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await resolveIssueIdOrKey(orgId, params.id);
    if (!issue || !(await canAccessProject(orgId, userId, issue.projectId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Outgoing only — when "A relates to B" is created, we surface it on A.
    // The target side is rendered separately via incomingLinks if we ever
    // want a bidirectional view, but Jira-style "relates to" is symmetric
    // semantically so showing one side is enough.
    const links = await db.qtIssueLink.findMany({
      where: { orgId: orgId, sourceIssueId: issue.id },
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
    const issue = await resolveIssueIdOrKey(orgId, params.id);
    if (!issue || !(await canAccessProject(orgId, userId, issue.projectId))) {
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
    // Target must live in the same tenant. We don't require the same project
    // — cross-project "relates to" is a useful pattern. Org-scoped by `orgId`,
    // never a request value.
    const target = await resolveIssueIdOrKey(orgId, parsed.data.targetIssueId);
    if (!target) {
      return NextResponse.json({ success: false, error: "Target issue not found" }, { status: 404 });
    }
    // Compared AFTER both sides are resolved — "WST-42" and its cuid are the
    // same issue, and a raw comparison would not catch that.
    if (target.id === issue.id) {
      return NextResponse.json(
        { success: false, error: "Cannot link an issue to itself" },
        { status: 400 },
      );
    }
    const existing = await db.qtIssueLink.findFirst({
      where: {
        sourceIssueId: issue.id,
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
        // The resolved cuid — see the note at the top of this file.
        sourceIssueId: issue.id,
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
