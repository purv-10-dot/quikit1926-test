import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  createMaterialIssue,
  listMaterialIssues,
  countMaterialIssues,
  countMaterialIssuesForDate,
} from "@/lib/store/material-issue-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

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
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
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
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listMaterialIssues(ctx.tenantId, { ...baseOpts, ...paging }),
      () => countMaterialIssues(ctx.tenantId, baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[store/issues.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  // Resolve the project so we can denormalise name onto the row — keeps
  // the list column readable without a join.
  const project: any = await (db as any).cnProject.findFirst({
    where: {
      id: body.projectId,
      tenantId: ctx.tenantId,
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
    const c: any = await (db as any).cnContractor.findFirst({
      where: {
        id: body.contractorId,
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
      },
      select: { id: true, companyName: true, name: true },
    });
    contractorName = c?.companyName ?? c?.name ?? null;
  }

  // Auto-assign issueNumber — MI-<YYYYMMDD>-<seq> per tenant per day.
  const issueDateStr: string =
    body.issueDate ?? new Date().toISOString().slice(0, 10);
  const compactDate = issueDateStr.replace(/-/g, "");
  const todaysCount = await countMaterialIssuesForDate(
    ctx.tenantId,
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

  const lines: any[] = Array.isArray(body.lines) ? body.lines : [];

  const record = await createMaterialIssue({
    tenantId: ctx.tenantId,
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
