import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("approvals");

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  docType: z.enum(["pr", "po", "rab", "vendor_bill", "payroll", "other"]),
  minAmount: z.number().min(0).optional().nullable(),
  approverId: z.string().min(1),
});

export const GET = withTenantAuth(async ({ tenantId }) => {
  const list = await db.cnApprovalRule.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ docType: "asc" }, { minAmount: "asc" }],
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = ruleSchema.parse(await req.json());
  const rule = await db.cnApprovalRule.create({
    data: { tenantId, ...input, minAmount: input.minAmount ?? null, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: rule }, { status: 201 });
});
