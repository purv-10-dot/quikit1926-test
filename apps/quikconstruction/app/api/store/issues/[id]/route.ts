import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  deleteMaterialIssue,
  findMaterialIssueById,
  updateMaterialIssue,
} from "@/lib/store/material-issue-repository";

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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const row = await findMaterialIssueById(ctx.tenantId, params.id);
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
      where: { id: row.approvalId, tenantId: ctx.tenantId },
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
  const users = userIds.length
    ? await (db as any).cnUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, username: true },
      })
    : [];
  // Prefer `fullName`, fall back to `username` — some seeded users have
  // a blank fullName which would otherwise render as the raw id.
  const nameById = new Map<string, string>(
    users.map((u: any) => [u.id, u.fullName || u.username || u.id]),
  );

  if (instance) {
    approval = {
      id: instance.id,
      status: instance.status,
      currentStepOrder: instance.currentStepOrder,
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const body = await req.json();
  const {
    id: _a,
    tenantId: _b,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateMaterialIssue(id, {
    tenantId: ctx.tenantId,
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const ok = await deleteMaterialIssue(ctx.tenantId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
