import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { resolveEffectiveStep } from "@/lib/approvals/step-resolution";
import {
  repairHistoryComment,
  repointNote,
  validateRepairCompletion,
} from "@/lib/approvals/complete-repaired-approval";
import { boqService, BOQError } from "@/lib/boq";
import { recordAudit } from "@/lib/workflow/audit";
import { postDPRConsumptionOutward, StockError } from "@/lib/stock/ledger-service";

/**
 * POST /api/projects/dpr/:id/approve
 *
 * Workflow-driven approval for DPRs. Mirrors the Work Order approve route
 * step-walk semantics, plus BOQ-posting on the final approve step.
 *
 *   pending_approval ──approve (intermediate)──> pending_approval (next step)
 *   pending_approval ──approve (last step)─────> approved   + BOQ progress posted
 *   pending_approval ──reject─────────────────> rejected
 *   pending_approval ──return─────────────────> draft (approvalId cleared)
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = "approve" | "reject" | "return" | "complete";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "pm.dpr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.dpr`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!["approve", "reject", "return", "complete"].includes(action)) {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const dpr = await db.cnDailyProgressReport.findFirst({
    where: { id: params.id, orgId: ctx.orgId},
    select: {
      id: true,
      dprNumber: true,
      status: true,
      approvalId: true,
      projectId: true,
      consumptionLocationId: true,
      workItems: {
        select: {
          id: true,
          boqItemId: true,
          scopeType: true,
          scopeId: true,
          todayQty: true,
          woId: true,
        },
      },
      materialEntries: {
        select: {
          id: true,
          itemId: true,
          uomId: true,
          consumedQty: true,
        },
      },
    },
  });
  if (!dpr || dpr.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  if (!dpr.approvalId) {
    return NextResponse.json(
      {
        error:
          "This DPR was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: dpr.approvalId, orgId: ctx.orgId},
  });
  if (!instance) {
    return NextResponse.json(
      { error: "Approval instance not found" },
      { status: 404 },
    );
  }
  if (instance.status !== "pending_approval") {
    return NextResponse.json(
      {
        error: `Approval already ${instance.status} — no further actions allowed.`,
      },
      { status: 409 },
    );
  }

  // A mid-flight workflow edit can remove the step this instance is parked on.
  // Resolve against the instance's own chain (its submit-time snapshot when it
  // has one) and fall back to the highest surviving step below — the previous
  // hard 500 fired before the actor check, so nobody could action the DPR.
  const resolved = await resolveEffectiveStep(db, instance);
  const currentStep = resolved.step;
  if (!currentStep) {
    return NextResponse.json(
      {
        error:
          "This DPR's workflow has no steps configured, so it cannot be actioned. " +
          "Reconfigure it under Settings → Workflows.",
      },
      { status: 500 },
    );
  }

  // `complete` closes an instance whose chain is already fully approved — no
  // approver has anything left to act on. Authorised here, then routed through
  // the normal final-approve path below so BOQ progress and material
  // consumption still post exactly once.
  let repair: { closingStep: number; totalSteps: number; reason: string } | null =
    null;
  if (action === "complete") {
    const check = await validateRepairCompletion({
      ctx,
      instance,
      entityLabel: "DPR",
      reason: comments,
    });
    if (check.kind === "error") {
      return NextResponse.json(check.body, { status: check.status });
    }
    repair = {
      closingStep: check.closingStep,
      totalSteps: check.totalSteps,
      reason: check.reason,
    };
  }

  if (
    !repair &&
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverRoleId: currentStep.approverRoleId,
      },
      dpr.projectId ?? null,
    )
  ) {
    let expected = "an authorized approver";
    if (currentStep.approverUserId) {
      const pinned = await findCnUserById(currentStep.approverUserId);
      expected = pinned?.fullName
        ? `${pinned.fullName} (pinned approver)`
        : "the pinned approver for this step";
    } else if (currentStep.approverRoleId) {
      expected =
        `a user with role "${currentStep.approverRoleId}"` +
        (dpr.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this DPR at step ${resolved.effectiveStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  // The step the history row is written against.
  const actingStepOrder = repair?.closingStep ?? resolved.effectiveStepOrder;

  // A repair is terminal by definition — its chain has no unapproved step left.
  const nextStep = repair
    ? null
    : (resolved.steps.find((s) => s.stepOrder > actingStepOrder) ?? null);

  // A repair takes the approve branches: same side effects, different authority.
  const effectiveAction: Action = repair ? "approve" : action;

  // ── Pre-resolve BOQ ids → boqNos so the txn doesn't do extra reads. ──
  // Only used when approving AND this is the final step.
  const isFinalApprove = effectiveAction === "approve" && !nextStep;

  // Material consumption is deducted from a single location on final
  // approve. Block early if there are materials but no location to
  // deduct them from — better than failing mid-transaction.
  const materialEntries = dpr.materialEntries ?? [];
  if (isFinalApprove && materialEntries.length > 0 && !dpr.consumptionLocationId) {
    return NextResponse.json(
      {
        error:
          "This DPR logs material consumption but has no consumption location set. " +
          "Set a consumption location before approving.",
      },
      { status: 400 },
    );
  }

  let boqNoById = new Map<string, string>();
  if (isFinalApprove) {
    const boqItemIds = (dpr.workItems ?? [])
      .map((l) => l.boqItemId)
      .filter((v): v is string => Boolean(v));
    if (boqItemIds.length) {
      const boqRows = await db.cnBOQItemV2.findMany({
        where: {
          id: { in: boqItemIds },
          orgId: ctx.orgId,
          projectId: dpr.projectId,
        },
        select: { id: true, boqNo: true },
      });
      boqNoById = new Map<string, string>(
        boqRows.map((r) => [r.id, r.boqNo]),
      );
    }
  }

  let dprStatusUpdate: Record<string, unknown> | null = null;
  const appliedUpdates: Array<{ boqNo: string; qty: number; workType: string }> = [];
  let materialsConsumed = 0;

  try {
    await db.$transaction(async (tx) => {
      await tx.cnApprovalHistory.create({
        data: {
          instanceId: instance.id,
          stepOrder: actingStepOrder,
          action: effectiveAction,
          actionById: ctx.userId,
          comments: repair
            ? repairHistoryComment({
                missingStepOrder: instance.currentStepOrder,
                totalSteps: repair.totalSteps,
                reason: repair.reason,
              })
            : resolved.repointed
              ? repointNote({
                  parkedStepOrder: instance.currentStepOrder,
                  actedStepOrder: actingStepOrder,
                  comments,
                })
              : comments || null,
        },
      });

      if (effectiveAction === "approve") {
        if (!nextStep) {
          // Final step → flip DPR to approved AND post BOQ progress
          // entries inside this same transaction.
          await tx.cnApprovalInstance.update({
            where: { id: instance.id },
            data: {
              status: "approved",
              completedAt: new Date(),
              currentStepOrder: actingStepOrder,
            },
          });

          for (const line of dpr.workItems ?? []) {
            const todayQty = parseFloat(String(line.todayQty ?? "0"));
            if (todayQty <= 0) continue;

            const workType: "sub_contractor" | "self" = line.woId
              ? "sub_contractor"
              : "self";

            // FREE_SCOPE lines anchor on an activity item — post through the
            // activity ledger (boqItemId stays null).
            if (line.scopeType === "ACTIVITY" && line.scopeId) {
              await boqService.applyActivityDPRProgressTxn(
                tx,
                ctx,
                dpr.projectId,
                line.scopeId,
                todayQty,
                workType,
                {
                  dprId: dpr.id,
                  dprLineId: line.id,
                  workOrderId: line.woId ?? undefined,
                  overrideFlag: false,
                },
              );
              appliedUpdates.push({ boqNo: line.scopeId, qty: todayQty, workType });
              continue;
            }

            const boqNo = line.boqItemId ? boqNoById.get(line.boqItemId) : undefined;
            if (!boqNo) continue;

            await boqService.applyDPRProgressTxn(
              tx,
              ctx,
              dpr.projectId,
              boqNo,
              todayQty,
              workType,
              {
                dprId: dpr.id,
                dprLineId: line.id,
                workOrderId: line.woId ?? undefined,
                overrideFlag: false,
              },
            );

            appliedUpdates.push({ boqNo, qty: todayQty, workType });
          }

          // Deduct consumed materials from stock at the consumption
          // location, valued at the location's moving-average rate. The
          // ledger service maintains CnStockBalance + audit and rejects
          // if any line would drive the balance negative.
          if (materialEntries.length > 0 && dpr.consumptionLocationId) {
            const consumption = await postDPRConsumptionOutward(tx, ctx, {
              id: dpr.id,
              dprNumber: dpr.dprNumber,
              projectId: dpr.projectId,
              locationId: dpr.consumptionLocationId,
              lines: materialEntries.map((m) => ({
                lineId: m.id,
                itemId: m.itemId,
                uomId: m.uomId,
                consumedQty: Number(m.consumedQty ?? 0),
              })),
            });
            // Snapshot the resolved rate/amount back onto each entry.
            for (const c of consumption) {
              await tx.cnDPRMaterialEntry.update({
                where: { id: c.lineId },
                data: { unitRate: c.unitRate, amount: c.amount },
              });
            }
            materialsConsumed = consumption.length;
          }

          await recordAudit(tx, ctx, {
            entityType: "dpr",
            entityId: dpr.id,
            action: "approve",
            changes: {
              from: dpr.status,
              to: "approved",
              linesApplied: appliedUpdates.length,
              materialsConsumed,
              comments: comments || undefined,
              ...(repair
                ? {
                    completedViaRepair: true,
                    parkedOnRemovedStep: instance.currentStepOrder,
                  }
                : {}),
            },
          });

          dprStatusUpdate = { status: "approved", updatedBy: ctx.userId };
        } else {
          await tx.cnApprovalInstance.update({
            where: { id: instance.id },
            data: { currentStepOrder: nextStep.stepOrder },
          });
          // Mid-flow — DPR stays "submitted" / "pending_approval".
        }
      } else if (effectiveAction === "reject") {
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: {
            status: "rejected",
            completedAt: new Date(),
            currentStepOrder: actingStepOrder,
          },
        });
        await recordAudit(tx, ctx, {
          entityType: "dpr",
          entityId: dpr.id,
          action: "reject",
          changes: { from: dpr.status, to: "rejected", comments },
        });
        dprStatusUpdate = { status: "rejected", updatedBy: ctx.userId };
      } else {
        // "return" — back to draft for the raiser to edit; clearing
        // approvalId means the next submit creates a fresh instance.
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: {
            status: "returned",
            completedAt: new Date(),
            currentStepOrder: actingStepOrder,
          },
        });
        await recordAudit(tx, ctx, {
          entityType: "dpr",
          entityId: dpr.id,
          action: "return",
          changes: { from: dpr.status, to: "draft", comments },
        });
        dprStatusUpdate = {
          status: "draft",
          approvalId: null,
          updatedBy: ctx.userId,
        };
      }
    });
  } catch (err: unknown) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    if (err instanceof StockError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    throw err;
  }

  if (dprStatusUpdate) {
    await db.cnDailyProgressReport.update({
      where: { id: dpr.id },
      data: dprStatusUpdate,
    });
  }

  const refreshed = await db.cnDailyProgressReport.findFirst({
    where: { id: dpr.id, orgId: ctx.orgId},
  });
  const refreshedInstance = await db.cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  if (!refreshedInstance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  const totalSteps = await db.cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });

  return NextResponse.json({
    ok: true,
    action,
    dpr: refreshed,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    boqUpdatesApplied: appliedUpdates.length,
    updates: appliedUpdates,
    materialsConsumed,
  });
}
