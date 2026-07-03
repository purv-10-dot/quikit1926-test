import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Budget");

const createSchema = z.object({
  fiscalYear: z.string().min(1, "fiscalYear required"),
  q1Amount: z.coerce.number().optional(),
  q2Amount: z.coerce.number().optional(),
  q3Amount: z.coerce.number().optional(),
  q4Amount: z.coerce.number().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = auth.view(async ({ orgId }) => {
  const budgets = await db.astFiscalBudget.findMany({
    where: { orgId },
    orderBy: { fiscalYear: "desc" },
  });
  return NextResponse.json({ success: true, data: budgets });
});

export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { fiscalYear, q1Amount, q2Amount, q3Amount, q4Amount, notes } = parsed.data;
  const budget = await db.astFiscalBudget.create({
    data: {
      orgId,
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
    action: "Budget Created",
    entityId: budget.id,
    entityName: `FY ${fiscalYear}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: budget }, { status: 201 });
});
