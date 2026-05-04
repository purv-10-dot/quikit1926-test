import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { woCreateSchema } from "@/lib/schemas/projects-4b";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const contractorId = req.nextUrl.searchParams.get("contractorId") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const list = await db.cnWorkOrder.findMany({
    where: {
      orgId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(projectId ? { projectId } : {}),
      ...(contractorId ? { contractorId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
      workCategory: { select: { id: true, name: true } },
    },
    orderBy: { woDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = woCreateSchema.parse(body);

  const [project, contractor] = await Promise.all([
    db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } }),
    db.cnContractor.findFirst({ where: { id: input.contractorId, orgId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  if (!contractor) return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 400 });

  const dup = await db.cnWorkOrder.findFirst({ where: { orgId, woNumber: input.woNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `WO '${input.woNumber}' already exists` }, { status: 409 });

  let subtotal = 0, taxAmount = 0;
  const linesData = input.lines.map((l) => {
    const amount = l.quantity * l.rate;
    const tax = l.gstRate ? amount * (l.gstRate / 100) : 0;
    subtotal += amount;
    taxAmount += tax;
    return {
      itemId: l.itemId ?? null,
      description: l.description,
      quantity: l.quantity,
      uomId: l.uomId ?? null,
      rate: l.rate,
      amount,
      gstRate: l.gstRate ?? null,
      taxAmount: tax,
      totalAmount: amount + tax,
      remarks: l.remarks ?? null,
    };
  });

  const wo = await db.cnWorkOrder.create({
    data: {
      orgId,
      woNumber: input.woNumber,
      projectId: input.projectId,
      contractorId: input.contractorId,
      workCategoryId: input.workCategoryId ?? null,
      woDate: new Date(input.woDate),
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      paymentTermsDays: input.paymentTermsDays ?? null,
      termsConditionId: input.termsConditionId ?? null,
      remarks: input.remarks,
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
      status: "draft",
      createdBy: userId,
      lines: { create: linesData },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: wo }, { status: 201 });
});
