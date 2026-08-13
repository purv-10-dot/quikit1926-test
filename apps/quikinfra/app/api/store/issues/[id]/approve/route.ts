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
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";
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

type Action = GateAction;

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

  if (!GATE_ACTIONS.includes(action)) {
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

  // Authorisation, step resolution and the repair / master-approval branches
  // live in the shared gate; this route keeps only the stock posting and the
  // issue's own status patch.
  const gate = await gateApprovalAction({
    ctx,
    instance,
    entityLabel: "issue",
    action,
    comments,
    projectId: issue.projectId ?? null,
  });
  if (gate.kind === "error") {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  // Final approval is the event that deducts stock. The /store/issue module
  // stores lines as JSON carrying only a uom *code* (no uomId), so resolve each
  // code to its uom id before posting — the stock ledger requires the id. Build
  // and validate the posting input up front; reject with 400 (before touching
  // the workflow) rather than write a wrong/zero-uom ledger row.
  const isFinalApprove = gate.isFinalApprove;
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
  let conflict: ClaimResult["conflict"] | undefined;

  try {
  await db.$transaction(async (tx) => {
    const claim = await claimAndRecord(tx, ctx, instance, gate);
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    if (gate.effectiveAction === "approve") {
      if (gate.isFinalApprove) {
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
      }
      // Mid-flow — issue keeps "pending_approval" as-is; the gate advanced it.
    } else if (gate.effectiveAction === "reject") {
      issueStatusUpdate = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectionReason: comments,
      };
    } else {
      // "return" — back to draft, approvalId cleared so re-submission
      // creates a fresh instance rather than reopening a closed one.
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

  // Lost the claim — someone else settled it first. Nothing was written, so no
  // stock moved and the status patch below must be skipped.
  if (conflict) {
    return NextResponse.json(await gateConflictResponse(conflict, "issue"), {
      status: 409,
    });
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
