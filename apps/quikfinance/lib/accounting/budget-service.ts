import { Prisma } from "@prisma/client";
import type { BudgetInput } from "@/lib/validations/operations.schema";
import { round2 } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export function periodSlots(period: string): number {
  return period === "yearly" ? 1 : period === "quarterly" ? 4 : 12;
}

/** Create/update a budget with its per-account, per-period line amounts. */
export async function saveBudget(tx: Tx, orgId: string, input: BudgetInput, budgetId?: string): Promise<{ id: string }> {
  const slots = periodSlots(input.period);
  const lines = (input.lines ?? []).filter((l) => l.account_id);
  const total = round2(lines.reduce((sum, l) => sum + (l.amounts ?? []).slice(0, slots).reduce((s, a) => s + (Number(a) || 0), 0), 0));

  let id = budgetId ?? "";
  if (budgetId) {
    await tx.$executeRaw`
      UPDATE budgets SET
        name = ${input.name}, fiscal_year = ${input.fiscal_year}, period = ${input.period},
        location_id = ${input.location_id ?? null}::uuid, department_id = ${input.department_id ?? null}::uuid,
        status = ${input.status}, total_amount = ${total}, updated_at = now()
      WHERE id = ${budgetId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM budget_lines WHERE budget_id = ${budgetId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO budgets (org_id, name, fiscal_year, period, location_id, department_id, status, total_amount)
      VALUES (${orgId}::uuid, ${input.name}, ${input.fiscal_year}, ${input.period},
        ${input.location_id ?? null}::uuid, ${input.department_id ?? null}::uuid, ${input.status}, ${total})
      RETURNING id`;
    id = rows[0].id;
  }

  for (const line of lines) {
    const amounts = (line.amounts ?? []).slice(0, slots);
    for (let i = 0; i < amounts.length; i += 1) {
      const amount = round2(Number(amounts[i]) || 0);
      if (amount === 0) continue;
      await tx.$executeRaw`
        INSERT INTO budget_lines (org_id, budget_id, account_id, month, amount)
        VALUES (${orgId}::uuid, ${id}::uuid, ${line.account_id}::uuid, ${i + 1}, ${amount})`;
    }
  }

  return { id };
}
