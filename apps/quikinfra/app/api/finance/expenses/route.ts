import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("finance");

const expenseSchema = z.object({
  expenseNumber: z.string().min(1).max(50),
  expenseDate: z.string().min(1),
  projectId: z.string().optional().nullable(),
  category: z.enum(["travel", "site_utility", "office", "labour_cash", "fuel", "misc"]),
  description: z.string().min(1).max(300),
  paidTo: z.string().optional().nullable(),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "bank", "upi", "cheque", "other"]),
  reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const list = await db.cnExpense.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(projectId ? { projectId } : {}) },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { expenseDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = expenseSchema.parse(await req.json());
  const dup = await db.cnExpense.findFirst({ where: { orgId, expenseNumber: input.expenseNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Expense '${input.expenseNumber}' already exists` }, { status: 409 });
  const e = await db.cnExpense.create({
    data: {
      orgId,
      expenseNumber: input.expenseNumber,
      expenseDate: new Date(input.expenseDate),
      projectId: input.projectId ?? null,
      category: input.category,
      description: input.description,
      paidTo: input.paidTo ?? null,
      amount: input.amount,
      paymentMode: input.paymentMode,
      reference: input.reference ?? null,
      remarks: input.remarks ?? null,
      status: "recorded",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: e }, { status: 201 });
});
