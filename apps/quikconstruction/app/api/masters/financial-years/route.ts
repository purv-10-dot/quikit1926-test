import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { financialYearCreateSchema } from "@/lib/schemas/masters-phase2";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
  const years = await db.cnFinancialYear.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(companyId ? { companyId } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ startDate: "desc" }],
  });
  return NextResponse.json({ success: true, data: years });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = financialYearCreateSchema.parse(body);
  const company = await db.cnCompany.findFirst({
    where: { id: input.companyId, tenantId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ success: false, error: "Company not found" }, { status: 400 });
  }
  const conflict = await db.cnFinancialYear.findFirst({
    where: { tenantId, companyId: input.companyId, label: input.label, deletedAt: null },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      { success: false, error: `Financial year '${input.label}' already exists for this company` },
      { status: 409 },
    );
  }
  // If marked current, un-current any other year for the same company
  const created = await db.$transaction(async (tx) => {
    if (input.isCurrent) {
      await tx.cnFinancialYear.updateMany({
        where: { tenantId, companyId: input.companyId, isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return tx.cnFinancialYear.create({
      data: {
        ...input,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        tenantId,
        createdBy: userId,
      },
    });
  });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
