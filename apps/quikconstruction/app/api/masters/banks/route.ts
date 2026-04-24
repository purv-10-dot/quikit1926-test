import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { bankCreateSchema } from "@/lib/schemas/masters-phase2";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
  const banks = await db.cnBank.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(companyId ? { companyId } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ bankName: "asc" }, { accountNo: "asc" }],
  });
  return NextResponse.json({ success: true, data: banks });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = bankCreateSchema.parse(body);
  const company = await db.cnCompany.findFirst({
    where: { id: input.companyId, tenantId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ success: false, error: "Company not found" }, { status: 400 });
  }
  const existing = await db.cnBank.findFirst({
    where: { tenantId, accountNo: input.accountNo, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Account number '${input.accountNo}' already exists` },
      { status: 409 },
    );
  }
  const bank = await db.cnBank.create({
    data: { ...input, tenantId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: bank }, { status: 201 });
});
