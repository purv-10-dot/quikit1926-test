import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createMaterialIssue,
  listMaterialIssues,
  countMaterialIssues,
  materialIssueStatusCounts,
  countMaterialIssuesForDate,
  type MIMaterialLine,
} from "@/lib/store/material-issue-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

/**
 * Material Issue (MI) API — Postgres-backed via the repository.
 *
 * GET  /api/store/issues
 *      ?status=…      filter by status (draft | requested | issued | cancelled | pending_approval | approved | rejected)
 *      ?projectId=…   filter by project
 *      ?prId=…        filter by source PR — useful from the PR detail page
 *      ?search=…      substring match on issueNumber / projectName / purpose
 *
 * POST /api/store/issues
 *      Manual creation from the Store → Material Issue page.
 *
 * Auto-assigns `issueNumber` like MI-<YYYYMMDD>-<seq> per day per tenant.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.issue", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const prId = searchParams.get("prId") ?? "";
  const search = searchParams.get("search") ?? "";

  const baseOpts = {
    status: status || null,
    projectId: projectId || null,
    prId: prId || null,
    search: search || null,
    allowedProjectIds: ctx.projectIds ?? null,
  };

  // Push LIMIT/OFFSET + COUNT down into the raw SQL query — no longer
  // loading the full table into memory just to slice in JS.
  if (searchParams.get("counts") === "1") {
    const counts = await materialIssueStatusCounts(ctx.orgId, baseOpts);
    return NextResponse.json({ counts });
  }

  const { sortBy, sortOrder } = parseSort(
    searchParams,
    ["issueNumber", "issueDate", "status", "projectName", "createdAt"],
    { field: "issueDate", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listMaterialIssues(ctx.orgId, { ...baseOpts, ...paging, sortBy, sortOrder }),
    () => countMaterialIssues(ctx.orgId, baseOpts),
  );

  // Per-row Approve/Reject visibility — driven by the workflow's current
  // step, not the caller's role. Batch-load every pending instance + its
  // workflow.steps in one round-trip and decorate each row.
  const rows = Array.isArray(result.data) ? result.data : [];
  const approvalIds = rows
    .map((r) => r.approvalId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const instances =
    approvalIds.length === 0
      ? []
      : await db.cnApprovalInstance.findMany({
          where: { id: { in: approvalIds }, orgId: ctx.orgId },
          include: {
            workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
          },
        });
  const instanceById = new Map(
    instances.map((i): [string, (typeof instances)[number]] => [i.id, i]),
  );
  const actor = {
    userId: ctx.userId,
    roleKey: ctx.roleKey,
    projectIds: ctx.projectIds,
  };
  const decorated = rows.map((row) => {
    const instance = row.approvalId ? instanceById.get(row.approvalId) : null;
    return {
      ...row,
      canActOnCurrentStep: instance
        ? canActOnCurrentStep(actor, instance, row.projectId ?? null)
        : false,
    };
  });

  return NextResponse.json({ ...result, data: decorated });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.issue", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.issue", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.issue`, 403);
  }

  const body = await req.json();
  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  // Resolve the project so we can denormalise name onto the row — keeps
  // the list column readable without a join.
  const project = await db.cnProject.findFirst({
    where: {
      id: body.projectId,
      orgId: ctx.orgId,
    },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${body.projectId} not found` },
      { status: 404 },
    );
  }

  // Resolve contractor name similarly — optional for non Sub-Contractor
  // paths, but when supplied we should cache the display name.
  let contractorName: string | null =
    body.contractorName ?? null;
  if (body.contractorId && !contractorName) {
    const c = await db.cnContractor.findFirst({
      where: {
        id: body.contractorId,
        orgId: ctx.orgId,
      },
      select: { id: true, name: true },
    });
    contractorName = c?.name ?? null;
  }

  // Auto-assign issueNumber — MI-<YYYYMMDD>-<seq> per tenant per day.
  const issueDateStr: string =
    body.issueDate ?? new Date().toISOString().slice(0, 10);
  const compactDate = issueDateStr.replace(/-/g, "");
  const todaysCount = await countMaterialIssuesForDate(
    ctx.orgId,
    issueDateStr,
  );
  const seq = String(todaysCount + 1).padStart(4, "0");
  const issueNumber = body.issueNumber ?? `MI-${compactDate}-${seq}`;

  // Build the display `issuedToName` from whichever input the form
  // actually filled. Same rollup the old demo-store writer did so the
  // list column reads correctly regardless of Issue Type.
  const issuedToName: string =
    body.issuedToName ||
    (body.issueType === "Self Work" ? body.teamDepartment : "") ||
    contractorName ||
    body.receivedBy ||
    "";

  const lines: MIMaterialLine[] = Array.isArray(body.lines) ? body.lines : [];

  const record = await createMaterialIssue({
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    issueNumber,
    projectId: project.id,
    projectName: project.name,
    locationId: body.locationId ?? body.sourceLocationId ?? null,
    locationName: body.locationName ?? null,
    issueDate: new Date(issueDateStr),
    issueType: body.issueType ?? null,
    contractorId: body.contractorId ?? null,
    contractorName,
    teamDepartment: body.teamDepartment ?? null,
    issuedToId: body.contractorId ?? null,
    issuedToName,
    issuedById: ctx.userId,
    issuedBy: body.issuedBy ?? null,
    receivedBy: body.receivedBy ?? null,
    prId: body.prId ?? null,
    prNumber: body.prNumber ?? null,
    prReference: body.prReference ?? null,
    woReference: body.woReference ?? null,
    vehicleNo: body.vehicleNo ?? null,
    gatePassNo: body.gatePassNo ?? null,
    driverName: body.driverName ?? null,
    driverMobileNo: body.driverMobileNo ?? null,
    challanNo: body.challanNo ?? null,
    transactionAmount: body.transactionAmount ?? null,
    intercityTransfer:
      body.intercityTransfer === true || body.intercityTransfer === "true",
    ewayBillNo: body.ewayBillNo ?? null,
    securityGuard: body.securityGuard ?? null,
    materialCondition: body.materialCondition ?? null,
    weighbridgeReading: body.weighbridgeReading ?? null,
    photoAttachment: body.photoAttachment ?? null,
    purpose: body.purpose ?? null,
    remarks: body.remarks ?? null,
    lines,
    status: body.status ?? "draft",
  });

  return NextResponse.json(record, { status: 201 });
}
