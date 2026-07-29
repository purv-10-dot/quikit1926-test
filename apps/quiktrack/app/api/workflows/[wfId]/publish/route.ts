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
  async ({ orgId, userId }, req, { params }) => {
    // Optional { statusMapping: { oldStatusId: newStatusId } } for the migration
    // step (empty on a first publish attempt).
    let statusMapping: Record<string, string> = {};
    try {
      const body: unknown = await req.json();
      if (body && typeof body === "object" && "statusMapping" in body) {
        const m = (body as { statusMapping?: unknown }).statusMapping;
        if (m && typeof m === "object") statusMapping = m as Record<string, string>;
      }
    } catch {
      // no body → first attempt, no mapping
    }

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
    // Stable non-null binding — the narrowing above doesn't reach nested closures.
    const projectId: string = wf.projectId;
    const canEdit =
      (await hasAdminAccess(userId, orgId)) ||
      (await userCanInProject(userId, orgId, projectId, "Project", "update"));
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
          where: { projectId, isDeleted: false },
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

    // Status migration (Jira "Publish Workflows" step 1). If the new draft drops
    // a status that existing issues currently sit on, those issues must be
    // remapped to a status that IS in the new workflow. Classic case: the scheme
    // maps every type to this one workflow, so we scope by project.
    const draftStatusIds = new Set(draft.statuses.map((s) => s.statusId));
    const affected = await db.qtIssue.groupBy({
      by: ["statusId"],
      where: { projectId, isDeleted: false },
      _count: { _all: true },
    });
    const droppedInUse = affected.filter((a) => !draftStatusIds.has(a.statusId));

    // Which dropped statuses still lack a valid mapping into the new set?
    const unmapped = droppedInUse.filter((a) => {
      const to = statusMapping[a.statusId];
      return !to || !draftStatusIds.has(to);
    });
    if (unmapped.length > 0) {
      const names = await db.qtIssueStatus.findMany({
        where: { id: { in: unmapped.map((u) => u.statusId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(names.map((n) => [n.id, n.name]));
      return NextResponse.json(
        {
          success: false,
          error: "Some work items are on statuses this workflow removes. Map them first.",
          code: "NEEDS_MIGRATION",
          migration: unmapped.map((u) => ({
            statusId: u.statusId,
            statusName: nameById.get(u.statusId) ?? u.statusId,
            count: u._count._all,
          })),
        },
        { status: 422 },
      );
    }

    // Non-blocking config warnings (WF-7.3): a transition INTO a DONE-category
    // status that has no set_resolution post-function will leave issues "stuck"
    // (done on the board but resolution IS NULL / still counted as open work).
    const doneStatusIds = new Set(
      (
        await db.qtIssueStatus.findMany({
          where: { projectId, isDeleted: false, category: "DONE" },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const warnings: Array<{ code: string; message: string; transitionId?: string }> = [];
    for (const t of draft.transitions) {
      if (!doneStatusIds.has(t.toStatusId)) continue;
      const hasSetResolution = (t.rules ?? []).some(
        (r) => r.kind === "POSTFUNCTION" && r.type === "set_resolution",
      );
      if (!hasSetResolution) {
        warnings.push({
          code: "DONE_WITHOUT_RESOLUTION",
          message: `Transition "${t.name}" moves issues to a Done status but does not set a resolution — those issues will still count as open.`,
          transitionId: t.id,
        });
      }
    }

    // Apply: rebuild nodes + transitions to match the draft, set the initial
    // transition, activate, clear the draft, migrate affected issues — all atomically.
    await db.$transaction(async (tx) => {
      // Migrate issues off dropped statuses first (mapping is fully covered here).
      for (const a of droppedInUse) {
        const toStatusId = statusMapping[a.statusId];
        const moved = await tx.qtIssue.findMany({
          where: { projectId, statusId: a.statusId, isDeleted: false },
          select: { id: true },
        });
        await tx.qtIssue.updateMany({
          where: { projectId, statusId: a.statusId, isDeleted: false },
          data: { statusId: toStatusId, updatedBy: userId },
        });
        if (moved.length > 0) {
          await tx.qtIssueTransitionLog.createMany({
            data: moved.map((m) => ({
              orgId,
              issueId: m.id,
              fromStatusId: a.statusId,
              toStatusId,
              actorId: userId,
              reason: "migration",
            })),
          });
        }
      }

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
        where: { projectId },
        data: { hasDraft: false, draftJson: Prisma.DbNull },
      });
    });

    return NextResponse.json({ success: true, data: { active: true, warnings } });
  },
);
