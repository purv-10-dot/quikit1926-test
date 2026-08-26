import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { recordIssueEvent } from "@/lib/services/issueHistory";
import {
  ISSUE_LINK_TYPE_VALUES,
  linkLabel,
  type LinkDirection,
} from "@/lib/services/issueLinkTypes";
import { resolveIssueIdOrKey } from "@/lib/mcp/resolveIssue";

const createLinkSchema = z.object({
  targetIssueId: z.string().min(1),
  // One of the 5 canonical types (RELATES_TO/BLOCKS/CLONES/DUPLICATES/CAUSES).
  type: z
    .string()
    .refine((v) => ISSUE_LINK_TYPE_VALUES.includes(v), "Unknown link type")
    .default("RELATES_TO"),
  // Which side of the edge the caller is describing. OUTWARD => this issue is
  // the source ("this blocks target"). INWARD => this issue is the target
  // ("this is blocked by the other"), so we flip source/target on write.
  direction: z.enum(["OUTWARD", "INWARD"]).default("OUTWARD"),
});

const issueSelect = {
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
} as const;

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
    // Fetch BOTH directions so a link created as "is blocked by X" (stored as
    // X blocks this) still surfaces here. Outgoing edges are viewed from the
    // OUTWARD side; incoming edges from the INWARD side. We normalise every row
    // to `{ otherIssue, side }` so the client renders one flat list regardless
    // of how the edge was stored.
    const [outgoing, incoming] = await Promise.all([
      db.qtIssueLink.findMany({
        where: { orgId: orgId, sourceIssueId: issue.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, createdAt: true, targetIssue: { select: issueSelect } },
      }),
      db.qtIssueLink.findMany({
        where: { orgId: orgId, targetIssueId: issue.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, createdAt: true, sourceIssue: { select: issueSelect } },
      }),
    ]);

    const rows = [
      ...outgoing.map((l) => ({
        id: l.id,
        type: l.type,
        side: "OUTWARD" as LinkDirection,
        label: linkLabel(l.type, "OUTWARD"),
        createdAt: l.createdAt,
        otherIssue: l.targetIssue,
      })),
      ...incoming.map((l) => ({
        id: l.id,
        type: l.type,
        side: "INWARD" as LinkDirection,
        label: linkLabel(l.type, "INWARD"),
        createdAt: l.createdAt,
        otherIssue: l.sourceIssue,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return NextResponse.json({ success: true, data: rows });
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
    // Resolve the stored edge orientation. OUTWARD: this --type--> other.
    // INWARD: other --type--> this (flip), so "this is blocked by other" is
    // stored identically to someone opening `other` and picking "blocks this".
    const inward = parsed.data.direction === "INWARD";
    const sourceIssueId = inward ? target.id : issue.id;
    const targetIssueId = inward ? issue.id : target.id;
    // The edge's project follows its source issue (the owning side).
    const edgeProjectId = inward ? target.projectId : issue.projectId;

    const existing = await db.qtIssueLink.findFirst({
      where: { sourceIssueId, targetIssueId, type: parsed.data.type },
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
        projectId: edgeProjectId,
        sourceIssueId,
        targetIssueId,
        type: parsed.data.type,
        createdBy: userId,
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
        sourceIssue: { select: issueSelect },
        targetIssue: { select: issueSelect },
      },
    });

    // Label + "other" issue from THIS issue's point of view for the response
    // and history entry.
    const side = parsed.data.direction;
    const otherIssue = inward ? created.sourceIssue : created.targetIssue;
    void recordIssueEvent({
      orgId,
      projectId: issue.projectId,
      issueId: issue.id,
      userId,
      field: "Link",
      oldValue: null,
      newValue: `This work item ${linkLabel(created.type, side)} ${otherIssue.key}`,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          type: created.type,
          side,
          label: linkLabel(created.type, side),
          createdAt: created.createdAt,
          otherIssue,
        },
      },
      { status: 201 },
    );
  },
);
