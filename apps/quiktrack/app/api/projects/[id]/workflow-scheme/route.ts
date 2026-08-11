import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * GET  /api/projects/[id]/workflow-scheme
 * The project's workflow scheme with its workflows and the issue-type → workflow
 * assignments, shaped for the Workflows overview screen. Also returns the
 * project's issue types (for the Assign-issue-types dialog) and whether a draft
 * is pending.
 *
 * Returns `data: null` when the project has no scheme yet (unstructured space).
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const scheme = await db.qtWorkflowScheme.findUnique({
      where: { projectId },
      select: {
        id: true,
        name: true,
        hasDraft: true,
        items: {
          select: {
            id: true,
            isDefault: true,
            issueTypeId: true,
            issueType: { select: { id: true, name: true } },
            workflow: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
                _count: { select: { workflowStatuses: true, transitions: true } },
              },
            },
          },
        },
      },
    });

    const issueTypes = await db.qtIssueType.findMany({
      where: { projectId, isDeleted: false },
      orderBy: { orderIndex: "asc" },
      select: { id: true, name: true, color: true, icon: true },
    });

    return NextResponse.json({
      success: true,
      data: { scheme, issueTypes },
    });
  },
  { paramKey: "id" },
);

/**
 * POST /api/projects/[id]/workflow-scheme
 * Create an empty scheme for a project that has none (an unstructured space
 * opting into workflows). Idempotent — returns the existing scheme if present.
 */
export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId }) => {
    const existing = await db.qtWorkflowScheme.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }
    const scheme = await db.qtWorkflowScheme.create({
      data: { orgId, projectId, name: "Default Workflow Scheme" },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: scheme }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
