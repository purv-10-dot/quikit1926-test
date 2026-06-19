import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findMaterialIssueById,
  patchMaterialIssueStatus,
} from "@/lib/store/material-issue-repository";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { postMaterialIssueOutward, StockError } from "@/lib/stock/ledger-service";

/**
 * POST /api/store/issues/:id/approve
 *
 * Workflow-driven approval for Material Issues. Mirrors the PR /
 * Work Order approve route. MI row is updated via the material-issue
 * repository after the Prisma transaction commits — same pattern we
 * use for Material Estimation since the status patch uses raw SQL
 * and can't join the approval-instance transaction.
 *
 *   Pending Approval ──approve (intermediate)──> Pending Approval (next step)
 *   Pending Approval ──approve (last step)─────> Approved
 *   Pending Approval ──reject─────────────────> Rejected
 *   Pending Approval ──return─────────────────> Draft  (approvalId cleared)
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = "approve" | "reject" | "return";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.issue", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "store.issue", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.issue`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!["approve", "reject", "return"].includes(action)) {
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

  const issue = await findMaterialIssueById(ctx.orgId, params.id);
  if (!issue) {
    return NextResponse.json(
      { error: "Material Issue not found" },
      { status: 404 },
    );
  }
  if (!issue.approvalId) {
    return NextResponse.json(
      {
        error:
          "This material issue was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: issue.approvalId, orgId: ctx.orgId },
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

  const currentStep = await db.cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: instance.currentStepOrder,
    },
  });
  if (!currentStep) {
    return NextResponse.json(
      {
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this issue was mid-flight.`,
      },
      { status: 500 },
    );
  }

  if (
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverRoleId: currentStep.approverRoleId,
      },
      issue.projectId ?? null,
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
        (issue.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this issue at step ${instance.currentStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  const nextStep = await db.cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: { gt: instance.currentStepOrder },
    },
    orderBy: { stepOrder: "asc" },
  });

  // Final approval is the event that deducts stock. The /store/issue module
  // stores lines as JSON carrying only a uom *code* (no uomId), so resolve each
  // code to its uom id before posting — the stock ledger requires the id. Build
  // and validate the posting input up front; reject with 400 (before touching
  // the workflow) rather than write a wrong/zero-uom ledger row.
  const isFinalApprove = action === "approve" && !nextStep;
  let postingLines: Array<{ itemId: string; uomId: string; issuedQty: number; unitRate: number }> = [];
  if (isFinalApprove) {
    const rawLines = Array.isArray(issue.lines) ? (issue.lines as Array<Record<string, unknown>>) : [];
    if (!issue.locationId) {
      return NextResponse.json(
        { error: "Cannot approve issue: no store location assigned. Edit the issue and pick a location first." },
        { status: 400 },
      );
    }
    if (rawLines.length === 0) {
      return NextResponse.json({ error: "Cannot approve issue: no line items." }, { status: 400 });
    }
    const codes = Array.from(
      new Set(rawLines.map((l) => String(l.uomCode ?? "").trim()).filter(Boolean)),
    );
    const uoms = codes.length
      ? await db.cnUOM.findMany({
          where: { orgId: ctx.orgId, code: { in: codes } },
          select: { id: true, code: true },
        })
      : [];
    const uomIdByCode = new Map(uoms.map((u) => [u.code, u.id]));
    const unresolved = new Set<string>();
    let missingItem = false;
    postingLines = rawLines.map((l) => {
      const itemId = String(l.itemId ?? "");
      if (!itemId) missingItem = true;
      const code = String(l.uomCode ?? "").trim();
      const uomId = uomIdByCode.get(code);
      if (!uomId) unresolved.add(code || "(blank)");
      return {
        itemId,
        uomId: uomId ?? "",
        issuedQty: Number(l.quantity ?? l.issueQty ?? l.qty ?? 0),
        unitRate: Number(l.unitRate ?? 0),
      };
    });
    if (missingItem) {
      return NextResponse.json({ error: "Cannot approve issue: a line is missing its item." }, { status: 400 });
    }
    if (unresolved.size) {
      return NextResponse.json(
        {
          error: `Cannot approve issue: unrecognized unit code(s) ${Array.from(unresolved).join(", ")}. Fix the issue lines and resubmit.`,
        },
        { status: 400 },
      );
    }
  }

  let issueStatusUpdate: Record<string, unknown> | null = null;

  try {
  await db.$transaction(async (tx) => {
    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: instance.currentStepOrder,
        action,
        actionById: ctx.userId,
        comments: comments || null,
      },
    });

    if (action === "approve") {
      if (!nextStep) {
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "approved", completedAt: new Date() },
        });
        // Final approval deducts stock: appends CnStockLedger rows AND syncs
        // CnStockBalance in this same txn. A StockError (e.g. insufficient
        // stock) rolls back the approval too, so status never advances past a
        // failed posting.
        await postMaterialIssueOutward(tx, ctx, {
          id: issue.id,
          issueNumber: issue.issueNumber,
          projectId: issue.projectId,
          locationId: issue.locationId as string,
          lines: postingLines,
        });
        issueStatusUpdate = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
        };
      } else {
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { currentStepOrder: nextStep.stepOrder },
        });
        // Mid-flow — issue keeps "pending_approval" as-is.
      }
    } else if (action === "reject") {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "rejected", completedAt: new Date() },
      });
      issueStatusUpdate = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectionReason: comments,
      };
    } else {
      // "return" — back to draft, approvalId cleared so re-submission
      // creates a fresh instance rather than reopening a closed one.
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      issueStatusUpdate = {
        status: "draft",
        approvalId: null,
        returnedAt: new Date(),
        returnedBy: ctx.userId,
        returnReason: comments,
      };
    }
  });
  } catch (err: unknown) {
    if (err instanceof StockError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
    }
    throw err;
  }

  if (issueStatusUpdate) {
    await patchMaterialIssueStatus(ctx.orgId, issue.id, {
      ...(issueStatusUpdate as Parameters<typeof patchMaterialIssueStatus>[2]),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findMaterialIssueById(ctx.orgId, issue.id);
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
    materialIssue: refreshed,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
  });
}
