import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Budget");

const updateSchema = z.object({
  fiscalYear: z.string().min(1, "fiscalYear required"),
  q1Amount: z.coerce.number().optional(),
  q2Amount: z.coerce.number().optional(),
  q3Amount: z.coerce.number().optional(),
  q4Amount: z.coerce.number().optional(),
  notes: z.string().nullable().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astFiscalBudget.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { fiscalYear, q1Amount, q2Amount, q3Amount, q4Amount, notes } = parsed.data;
  const budget = await db.astFiscalBudget.update({
    where: { id },
    data: {
      fiscalYear,
      q1Amount: Number(q1Amount) || 0,
      q2Amount: Number(q2Amount) || 0,
      q3Amount: Number(q3Amount) || 0,
      q4Amount: Number(q4Amount) || 0,
      notes: notes || null,
    },
  });
  await audit({
    orgId,
    module: "Budget",
    action: "Budget Updated",
    entityId: budget.id,
    entityName: `FY ${fiscalYear}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: budget });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const existing = await db.astFiscalBudget.findFirst({
    where: { id, orgId },
    select: { id: true, fiscalYear: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astFiscalBudget.delete({ where: { id } });
  await audit({
    orgId,
    module: "Budget",
    action: "Budget Deleted",
    entityId: id,
    entityName: `FY ${existing.fiscalYear}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});
