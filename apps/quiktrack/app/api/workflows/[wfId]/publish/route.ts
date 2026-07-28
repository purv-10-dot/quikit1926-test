import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import {
  draftToValidatable,
  isWorkflowDraft,
  validateRuleConfig,
  validateWorkflowGraph,
  type WorkflowDraft,
} from "@/lib/services/workflow";

/**
 * POST /api/workflows/[wfId]/publish
 * Graph-validate the pending draft, then apply it to the live QtWorkflow* rows
 * in one transaction and clear the draft. On validation failure returns 422 with
 * the per-node errors so the editor can highlight them.
 *
 * Phase 2 scope: we rebuild the workflow's status nodes + transitions from the
 * draft. Existing-issue status migration (when the status set changes) is a
 * Phase 4 concern; here we only touch workflow config, never issue rows.
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §8.
 */
export const POST = withOrgAuth<{ wfId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const wf = await db.qtWorkflow.findFirst({
      where: { id: params.wfId, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!wf) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!wf.projectId) {
      return NextResponse.json(
        { success: false, error: "Org-shared templates cannot be published here." },
        { status: 400 },
      );
    }
    const canEdit =
      (await hasAdminAccess(userId, orgId)) ||
      (await userCanInProject(userId, orgId, wf.projectId, "Project", "update"));
    if (!canEdit) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    const scheme = await db.qtWorkflowScheme.findUnique({
      where: { projectId: wf.projectId },
      select: { hasDraft: true, draftJson: true },
    });
    if (!scheme?.hasDraft || !isWorkflowDraft(scheme.draftJson)) {
      return NextResponse.json(
        { success: false, error: "There is no draft to publish." },
        { status: 400 },
      );
    }
    const draft = scheme.draftJson as WorkflowDraft;
    if (draft.workflowId !== wf.id) {
      return NextResponse.json(
        { success: false, error: "Draft does not match this workflow." },
        { status: 400 },
      );
    }

    // Guard: every node/target status must belong to this project (a workflow
    // may only reference its own project's statuses).
    const projectStatusIds = new Set(
      (
        await db.qtIssueStatus.findMany({
          where: { projectId: wf.projectId, isDeleted: false },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const referenced = new Set<string>([
      ...draft.statuses.map((s) => s.statusId),
      ...draft.transitions.map((t) => t.toStatusId),
      ...draft.transitions.flatMap((t) => t.fromStatusIds),
    ]);
    for (const id of referenced) {
      if (!projectStatusIds.has(id)) {
        return NextResponse.json(
          { success: false, error: "Draft references a status that is not in this project." },
          { status: 400 },
        );
      }
    }

    // Graph validation (the publish gate).
    const result = validateWorkflowGraph(draftToValidatable(draft));
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "The workflow is not valid.", errors: result.errors },
        { status: 422 },
      );
    }

    // Rule config validation (each rule's config must satisfy its handler).
    for (const t of draft.transitions) {
      for (const r of t.rules ?? []) {
        const errs = validateRuleConfig(r.kind, r.type, r.config ?? {});
        if (errs.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Transition "${t.name}": ${errs.join(", ")}`,
              errors: errs.map((message) => ({ code: "RULE_CONFIG", message, transitionId: t.id })),
            },
            { status: 422 },
          );
        }
      }
    }

    // Apply: rebuild nodes + transitions to match the draft, set the initial
    // transition, activate, clear the draft — all atomically.
    await db.$transaction(async (tx) => {
      await tx.qtWorkflowStatus.deleteMany({ where: { workflowId: wf.id } });
      // Deleting transitions cascades their from-joins and rules.
      await tx.qtWorkflowTransition.deleteMany({ where: { workflowId: wf.id } });

      await tx.qtWorkflowStatus.createMany({
        data: draft.statuses.map((s) => ({
          workflowId: wf.id,
          statusId: s.statusId,
          isInitial: s.isInitial,
          x: s.x,
          y: s.y,
          properties: s.properties ? (s.properties as object) : undefined,
        })),
      });

      let initialTransitionId: string | null = null;
      for (const [i, t] of draft.transitions.entries()) {
        const created = await tx.qtWorkflowTransition.create({
          data: {
            workflowId: wf.id,
            name: t.name,
            type: t.type,
            toStatusId: t.toStatusId,
            orderIndex: i,
          },
          select: { id: true },
        });
        if (t.fromStatusIds.length > 0) {
          await tx.qtWorkflowTransitionFrom.createMany({
            data: t.fromStatusIds.map((statusId) => ({
              transitionId: created.id,
              statusId,
            })),
            skipDuplicates: true,
          });
        }
        if (t.rules && t.rules.length > 0) {
          await tx.qtWorkflowRule.createMany({
            data: t.rules.map((r, ri) => ({
              transitionId: created.id,
              kind: r.kind,
              type: r.type,
              config: (r.config ?? {}) as object,
              errorMessage: r.errorMessage ?? null,
              groupNo: r.groupNo ?? 0,
              orderNo: r.orderNo ?? ri,
            })),
          });
        }
        if (t.type === "INITIAL") initialTransitionId = created.id;
      }

      await tx.qtWorkflow.update({
        where: { id: wf.id },
        data: {
          isActive: true,
          initialTransitionId,
          name: draft.name,
          description: draft.description,
          updatedBy: userId,
        },
      });

      await tx.qtWorkflowScheme.update({
        where: { projectId: wf.projectId as string },
        data: { hasDraft: false, draftJson: Prisma.DbNull },
      });
    });

    return NextResponse.json({ success: true, data: { active: true } });
  },
);
