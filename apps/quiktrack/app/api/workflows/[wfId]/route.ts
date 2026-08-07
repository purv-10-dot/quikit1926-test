import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { isWorkflowDraft, type WorkflowDraft } from "@/lib/services/workflow";

/**
 * Load a workflow scoped to the caller's org and return the project it belongs
 * to (null projectId = org-shared template — those aren't editable here).
 */
async function loadOwnedWorkflow(orgId: string, wfId: string) {
  return db.qtWorkflow.findFirst({
    where: { id: wfId, orgId, isDeleted: false },
    select: { id: true, projectId: true, name: true, description: true },
  });
}

/** Write gate for a workflow: global admin OR Project:update in its project. */
async function canEditWorkflow(
  userId: string,
  orgId: string,
  projectId: string | null,
): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  if (!projectId) return false; // org templates: admin-only
  return userCanInProject(userId, orgId, projectId, "Project", "update");
}

/**
 * GET /api/workflows/[wfId]
 * The full editor read-model: the workflow's live statuses + transitions (one
 * query, no N+1) PLUS, if a draft is pending on its scheme, the draft document.
 * The editor prefers the draft when present.
 */
export const GET = withOrgAuth<{ wfId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const wf = await db.qtWorkflow.findFirst({
      where: { id: params.wfId, orgId, isDeleted: false },
      select: {
        id: true,
        projectId: true,
        name: true,
        description: true,
        isActive: true,
        initialTransitionId: true,
        workflowStatuses: {
          select: {
            statusId: true,
            isInitial: true,
            x: true,
            y: true,
            properties: true,
            status: { select: { id: true, name: true, color: true, category: true } },
          },
        },
        transitions: {
          where: { isDeleted: false },
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            name: true,
            type: true,
            toStatusId: true,
            fromStatuses: { select: { statusId: true } },
            rules: {
              select: { id: true, kind: true, type: true, config: true, errorMessage: true, groupNo: true, orderNo: true },
            },
            triggers: { select: { event: true } },
          },
        },
      },
    });
    if (!wf) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Read gate: membership in the workflow's project (or admin / org template).
    if (
      !(await hasAdminAccess(userId, orgId)) &&
      (!wf.projectId ||
        !(await userCanInProject(userId, orgId, wf.projectId, "ProjectMember", "view")))
    ) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    // Pull any pending draft on the project's scheme.
    let draft: WorkflowDraft | null = null;
    if (wf.projectId) {
      const scheme = await db.qtWorkflowScheme.findUnique({
        where: { projectId: wf.projectId },
        select: { hasDraft: true, draftJson: true },
      });
      if (scheme?.hasDraft && isWorkflowDraft(scheme.draftJson)) {
        draft = scheme.draftJson;
      }
    }

    return NextResponse.json({ success: true, data: { workflow: wf, draft } });
  },
);

/**
 * PUT /api/workflows/[wfId]
 * Save the editor's working document to the project scheme's draft (does NOT
 * touch live rows — that happens on publish). Sets hasDraft=true.
 */
export const PUT = withOrgAuth<{ wfId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const wf = await loadOwnedWorkflow(orgId, params.wfId);
    if (!wf) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canEditWorkflow(userId, orgId, wf.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    if (!wf.projectId) {
      return NextResponse.json(
        { success: false, error: "Org-shared templates cannot be edited here." },
        { status: 400 },
      );
    }

    const body: unknown = await req.json();
    if (!isWorkflowDraft(body) || body.workflowId !== wf.id) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow draft." },
        { status: 400 },
      );
    }

    await db.qtWorkflowScheme.update({
      where: { projectId: wf.projectId },
      data: { hasDraft: true, draftJson: body as unknown as object },
    });
    return NextResponse.json({ success: true, data: { saved: true } });
  },
);
