import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { expenseInputSchema, saveExpense } from "@/lib/accounting/expense-service";
import { reverseJournalFor } from "@/lib/accounting/posting";
import { fetchAttachments } from "@/lib/accounting/attachments";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT e.*, to_char(e.expense_date,'YYYY-MM-DD') AS expense_date,
             a.name AS account_name, v.display_name AS vendor_name, cu.display_name AS customer_name,
             w.name AS location, pa.name AS paid_through, pr.name AS project_name
      FROM expenses e
      LEFT JOIN accounts a ON a.id = e.account_id
      LEFT JOIN contacts v ON v.id = e.vendor_id
      LEFT JOIN contacts cu ON cu.id = e.customer_id
      LEFT JOIN warehouses w ON w.id = e.warehouse_id
      LEFT JOIN accounts pa ON pa.id = e.payment_account_id
      LEFT JOIN projects pr ON pr.id = e.project_id
      WHERE e.id = ${params.id}::uuid AND e.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Expense was not found." });
    const journalId = rows[0].journal_entry_id;
    const journal = journalId
      ? ((await prisma.$queryRaw`
          SELECT a.name AS account, l.debit, l.credit
          FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
          WHERE l.journal_entry_id = ${journalId}::uuid AND l.org_id = ${orgId}::uuid ORDER BY l.display_order ASC`) as unknown[])
      : [];
    const attachments = await fetchAttachments(prisma, orgId, "expense", params.id);
    return ok({ ...rows[0], journal, attachments });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = expenseInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The expense is invalid.", details: parsed.error.flatten() });
  }

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM expenses WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Expense was not found." });
    await prisma.$transaction((tx) => saveExpense(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM expenses WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    await prisma.$transaction(async (tx) => {
      await reverseJournalFor(tx, orgId, "expense", params.id);
      await tx.$executeRaw`DELETE FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'expense' AND entity_id = ${params.id}::uuid`;
      await tx.$executeRaw`DELETE FROM expenses WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
