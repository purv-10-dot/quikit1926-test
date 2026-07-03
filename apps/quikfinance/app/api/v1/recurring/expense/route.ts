import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { expenseInputSchema, saveExpense } from "@/lib/accounting/expense-service";

export const dynamic = "force-dynamic";

const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "annually"] as const;

// A recurring expense = a draft template expense (never posts) + a schedule.
// Generated expenses are cloned from the template by processDueRecurring().
const recurringExpenseSchema = z.object({
  profile_name: z.string().trim().min(1).max(160),
  frequency: z.enum(FREQUENCIES),
  start_date: z.coerce.date().transform((v) => v.toISOString().slice(0, 10)),
  end_date: z.coerce.date().transform((v) => v.toISOString().slice(0, 10)).optional().nullable(),
  never_expires: z.boolean().default(false),
  expense: expenseInputSchema
});

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = recurringExpenseSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The recurring expense is invalid.", details: parsed.error.flatten() });
  const input = parsed.data;
  const endDate = input.never_expires ? null : input.end_date ?? null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Template expense stays a draft so it never posts to the ledger itself.
      const template = await saveExpense(tx, orgId, userId, { ...input.expense, status: "draft" });
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO recurring_transactions (org_id, source_type, source_id, profile_name, frequency, start_date, end_date, next_run_date, is_active)
        VALUES (${orgId}::uuid, 'expense', ${template.id}::uuid, ${input.profile_name}, ${input.frequency},
          ${input.start_date}::date, ${endDate}::date, ${input.start_date}::date, true)
        RETURNING id`;
      return { profileId: rows[0].id, templateId: template.id };
    });
    return ok(result, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
