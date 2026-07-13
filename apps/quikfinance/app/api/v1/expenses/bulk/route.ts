import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { expenseInputSchema, saveExpense } from "@/lib/accounting/expense-service";

export const dynamic = "force-dynamic";

const bulkSchema = z.object({ expenses: z.array(expenseInputSchema).min(1).max(100) });

/** Create many expenses at once (Bulk Add). Each posts its own balanced journal. */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "One or more expense rows are invalid.", details: parsed.error.flatten() });

  try {
    const ids = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const expense of parsed.data.expenses) {
        const r = await saveExpense(tx, orgId, userId, expense);
        out.push(r.id);
      }
      return out;
    });
    return ok({ created: ids.length, ids }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "BULK_CREATE_FAILED", message: errorMessage(error) });
  }
}
