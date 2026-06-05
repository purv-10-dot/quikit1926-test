import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  deleteMaterialIssue,
  findMaterialIssueById,
  updateMaterialIssue,
} from "@/lib/store/material-issue-repository";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

/**
 * Single Material Issue record — used by the detail page + edit flow.
 *
 *   GET    /api/store/issues/:id   → full row + joined approval timeline
 *   PATCH  /api/store/issues/:id   → partial update (status, remarks, ...)
 *   PUT    /api/store/issues/:id   → replace editable fields
 *   DELETE /api/store/issues/:id   → hard remove (admin tooling)
 *
 * Tenant scope is checked on every call; project-scope gate runs after
 * the row is fetched — matches the list endpoint's filter so a user
 * can never reach an issue tied to a project they're not assigned to.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.issue", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findMaterialIssueById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.projectId) {
    if (!ctx.projectIds.includes(row.projectId)) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
  }

  // Collect every user id the detail page might want to display — the
  // approval instance + the issue's own audit stripe (created / updated
  // / approved / rejected / returned / submitted). Doing one batched
  // lookup avoids N+1s and keeps the route under a single DB roundtrip
  // for user data regardless of how many approval steps there are.
  const auditUserIds = [
    row.createdBy,
    row.updatedBy,
    row.approvedBy,
    row.rejectedBy,
    row.returnedBy,
    row.submittedBy,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  let approval: any = null;
  let instance: any = null;
  if (row.approvalId) {
    instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: {
        history: { orderBy: { actionAt: "asc" } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
    });
  }

  const approvalUserIds = instance
    ? [
        instance.requestedById,
        ...instance.history.map((h: any) => h.actionById),
        ...(instance.workflow.steps
          .map((s: any) => s.approverUserId)
          .filter(Boolean) as string[]),
      ]
    : [];

  const userIds = Array.from(
    new Set<string>([...auditUserIds, ...approvalUserIds]),
  );
  const nameById = await resolveUserNames(userIds);

  if (instance) {
    const callerCanActOnCurrentStep = canActOnCurrentStep(
      {
        userId: ctx.userId,
        roleKey: ctx.roleKey,
        projectIds: ctx.projectIds,
      },
      instance,
      row.projectId ?? null,
    );
    approval = {
      id: instance.id,
      status: instance.status,
      currentStepOrder: instance.currentStepOrder,
      canActOnCurrentStep: callerCanActOnCurrentStep,
      completedAt: instance.completedAt?.toISOString?.() ?? null,
      requestedAt: instance.requestedAt.toISOString(),
      requestedById: instance.requestedById,
      requestedByName: nameById.get(instance.requestedById) ?? "User",
      workflow: {
        id: instance.workflow.id,
        name: instance.workflow.name,
        steps: instance.workflow.steps.map((s: any) => ({
          stepOrder: s.stepOrder,
          approverRoleId: s.approverRoleId,
          approverUserId: s.approverUserId,
          approverUserName: s.approverUserId
            ? (nameById.get(s.approverUserId) ?? null)
            : null,
        })),
      },
      history: instance.history.map((h: any) => ({
        stepOrder: h.stepOrder,
        action: h.action,
        actionById: h.actionById,
        actionByName: nameById.get(h.actionById) ?? "User",
        actionAt: h.actionAt.toISOString(),
        comments: h.comments,
      })),
    };
  }

  // Surface resolved display names alongside the raw ids so the Audit
  // section on the detail page reads human-friendly values instead of
  // cuids. The raw `*By` fields are preserved for callers that need id
  // linkage (e.g. analytics).
  return NextResponse.json({
    ...row,
    approval,
    createdByName: row.createdBy ? nameById.get(row.createdBy) ?? row.createdBy : null,
    updatedByName: row.updatedBy ? nameById.get(row.updatedBy) ?? row.updatedBy : null,
    approvedByName: row.approvedBy ? nameById.get(row.approvedBy) ?? row.approvedBy : null,
    rejectedByName: row.rejectedBy ? nameById.get(row.rejectedBy) ?? row.rejectedBy : null,
    returnedByName: row.returnedBy ? nameById.get(row.returnedBy) ?? row.returnedBy : null,
    submittedByName: row.submittedBy ? nameById.get(row.submittedBy) ?? row.submittedBy : null,
  });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireStoreAction("construction.issue", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.issue", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.issue`, 403);
  }

  const existing = await findMaterialIssueById(ctx.orgId, id);
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "material issue");
  if (guard) return guard;

  const body = await req.json();
  const {
    id: _a,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateMaterialIssue(id, {
    orgId: ctx.orgId,
    updatedBy: ctx.userId,
    projectName: safe.projectName,
    locationId: safe.locationId,
    locationName: safe.locationName,
    issueType: safe.issueType,
    contractorId: safe.contractorId,
    contractorName: safe.contractorName,
    teamDepartment: safe.teamDepartment,
    issuedToName: safe.issuedToName,
    issuedBy: safe.issuedBy,
    receivedBy: safe.receivedBy,
    prReference: safe.prReference,
    woReference: safe.woReference,
    vehicleNo: safe.vehicleNo,
    gatePassNo: safe.gatePassNo,
    transactionAmount: safe.transactionAmount,
    intercityTransfer:
      safe.intercityTransfer === true ||
      safe.intercityTransfer === "true"
        ? true
        : safe.intercityTransfer === false ||
            safe.intercityTransfer === "false"
          ? false
          : undefined,
    ewayBillNo: safe.ewayBillNo,
    materialCondition: safe.materialCondition,
    photoAttachment: safe.photoAttachment,
    purpose: safe.purpose,
    remarks: safe.remarks,
    lines: Array.isArray(safe.lines) ? safe.lines : undefined,
    status: safe.status,
  });
  if (!next) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  return NextResponse.json(next);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.issue", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.issue", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for store.issue`, 403);
  }

  const existing = await findMaterialIssueById(ctx.orgId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "material issue");
  if (guard) return guard;

  const ok = await deleteMaterialIssue(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
