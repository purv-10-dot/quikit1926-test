import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { financialYearUpdateSchema } from "@/lib/schemas/masters-phase2";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const year = await db.cnFinancialYear.findFirst({
    where: { id: params.id, orgId },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!year) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: year });
});

export const PATCH = withTenantAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.cnFinancialYear.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, companyId: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const body = await req.json();
  const input = financialYearUpdateSchema.parse(body);

  const updated = await db.$transaction(async (tx) => {
    if (input.isCurrent === true) {
      await tx.cnFinancialYear.updateMany({
        where: { orgId, companyId: existing.companyId, isCurrent: true, NOT: { id: params.id } },
        data: { isCurrent: false },
      });
    }
    return tx.cnFinancialYear.update({
      where: { id: params.id },
      data: {
        ...input,
        ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
        updatedBy: userId,
      },
    });
  });
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnFinancialYear.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnFinancialYear.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
