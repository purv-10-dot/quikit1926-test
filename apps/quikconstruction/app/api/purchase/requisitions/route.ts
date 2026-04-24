import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { prCreateSchema } from "@/lib/schemas/procurement";

const withTenantAuth = withTenantAuthForModule("purchase");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const prs = await db.cnPurchaseRequisition.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      lines: { include: { item: { select: { code: true, name: true } }, uom: { select: { code: true } } } },
    },
    orderBy: { requestDate: "desc" },
  });
  return NextResponse.json({ success: true, data: prs });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = prCreateSchema.parse(body);

  // Validate project
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });

  // Duplicate PR number?
  const dup = await db.cnPurchaseRequisition.findFirst({
    where: { tenantId, prNumber: input.prNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `PR number '${input.prNumber}' already exists` },
      { status: 409 },
    );
  }

  const pr = await db.cnPurchaseRequisition.create({
    data: {
      tenantId,
      prNumber: input.prNumber,
      projectId: input.projectId,
      requestedById: input.requestedById,
      requestDate: new Date(input.requestDate),
      requiredDate: input.requiredDate ? new Date(input.requiredDate) : null,
      purpose: input.purpose,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          estimatedRate: l.estimatedRate,
          estimatedAmount:
            l.estimatedAmount ?? (l.estimatedRate ? l.estimatedRate * l.quantity : null),
          specification: l.specification,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: pr }, { status: 201 });
});
