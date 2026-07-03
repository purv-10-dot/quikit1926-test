import { Prisma } from "@prisma/client";
import { z } from "zod";
import { expenseSchema } from "@/lib/validations/operations.schema";
import { idSchema } from "@/lib/validations/common.schema";
import { createJournalEntry, resolveControlAccounts, reverseJournalFor, round2 } from "@/lib/accounting/posting";
import { syncAttachments } from "@/lib/accounting/attachments";

type Tx = Prisma.TransactionClient;

export const expenseInputSchema = expenseSchema.extend({
  payment_account_id: idSchema.optional().nullable()
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * Create/update an expense and post it:
 *   Dr Expense account     (amount)
 *   Dr Tax Recoverable     (tax_amount)
 *   Cr Bank/Cash or A/P    (amount + tax)
 * Credits the chosen payment account when paid, otherwise Accounts Payable.
 */
export async function saveExpense(tx: Tx, orgId: string, userId: string | null, input: ExpenseInput, expenseId?: string): Promise<{ id: string }> {
  const amount = round2(input.amount);
  const taxAmount = round2(input.tax_amount ?? 0);
  const total = round2(amount + taxAmount);
  const isPosted = input.status === "posted";

  let id = expenseId ?? "";
  if (expenseId) {
    await tx.$executeRaw`
      UPDATE expenses SET
        expense_date = ${input.expense_date}::date,
        vendor_id = ${input.vendor_id ?? null}::uuid,
        customer_id = ${input.customer_id ?? null}::uuid,
        account_id = ${input.account_id}::uuid,
        project_id = ${input.project_id ?? null}::uuid,
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        amount = ${amount},
        tax_amount = ${taxAmount},
        currency = ${input.currency},
        payment_account_id = ${input.payment_account_id ?? null}::uuid,
        reference = ${input.reference ?? null},
        receipt_url = ${input.receipt_url ?? null},
        is_billable = ${input.is_billable},
        is_mileage = ${input.is_mileage ?? false},
        distance = ${input.distance ?? null},
        mileage_rate = ${input.mileage_rate ?? null},
        mileage_unit = ${input.mileage_unit ?? null},
        employee_name = ${input.employee_name ?? null},
        description = ${input.description},
        status = ${input.status},
        updated_at = now()
      WHERE id = ${expenseId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO expenses (org_id, expense_date, vendor_id, customer_id, account_id, project_id, warehouse_id, amount, tax_amount, currency, payment_account_id, reference, receipt_url, is_billable, is_mileage, distance, mileage_rate, mileage_unit, employee_name, description, status)
      VALUES (
        ${orgId}::uuid, ${input.expense_date}::date, ${input.vendor_id ?? null}::uuid, ${input.customer_id ?? null}::uuid, ${input.account_id}::uuid, ${input.project_id ?? null}::uuid, ${input.warehouse_id ?? null}::uuid, ${amount}, ${taxAmount},
        ${input.currency}, ${input.payment_account_id ?? null}::uuid, ${input.reference ?? null}, ${input.receipt_url ?? null}, ${input.is_billable}, ${input.is_mileage ?? false}, ${input.distance ?? null}, ${input.mileage_rate ?? null}, ${input.mileage_unit ?? null}, ${input.employee_name ?? null}, ${input.description}, ${input.status}
      ) RETURNING id`;
    id = rows[0].id;
  }

  await syncAttachments(tx, orgId, "expense", id, userId, input.attachments);

  let journalEntryId: string | null = null;
  if (isPosted) {
    const accounts = await resolveControlAccounts(tx, orgId);
    const creditAccount = input.payment_account_id ?? accounts.payable;
    if (!creditAccount) {
      throw new Error("Select a payment account, or add an Accounts Payable account to the chart of accounts.");
    }
    const lines = [{ account_id: input.account_id, debit: amount, credit: 0, description: input.description }];
    if (taxAmount > 0) {
      if (!accounts.taxRecoverable) {
        throw new Error("Chart of accounts is missing a Tax Recoverable (input tax) account.");
      }
      lines.push({ account_id: accounts.taxRecoverable, debit: taxAmount, credit: 0, description: "Input tax" });
    }
    lines.push({ account_id: creditAccount, debit: 0, credit: total, description: input.description });

    await reverseJournalFor(tx, orgId, "expense", id);
    journalEntryId = await createJournalEntry(tx, {
      orgId,
      entryDate: input.expense_date,
      memo: `Expense — ${input.description}`,
      sourceType: "expense",
      sourceId: id,
      createdBy: userId,
      lines
    });
  } else {
    await reverseJournalFor(tx, orgId, "expense", id);
  }

  await tx.$executeRaw`UPDATE expenses SET journal_entry_id = ${journalEntryId ? journalEntryId : null}::uuid WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;
  return { id };
}
