import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { accountSchema } from "@/lib/validations/account.schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Account detail: the account, its closing balance, and recent ledger transactions. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT a.*, p.name AS parent_account_name
      FROM accounts a LEFT JOIN accounts p ON p.id = a.parent_id
      WHERE a.id = ${params.id}::uuid AND a.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Account was not found." });

    const balRows = (await prisma.$queryRaw`
      SELECT COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
      FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
      WHERE l.account_id = ${params.id}::uuid AND je.org_id = ${orgId}::uuid AND je.status = 'posted'
    `) as Array<{ debit: string; credit: string }>;
    const debit = Number(balRows[0]?.debit ?? 0);
    const credit = Number(balRows[0]?.credit ?? 0);

    const transactions = (await prisma.$queryRaw`
      SELECT l.id, to_char(je.entry_date,'YYYY-MM-DD') AS date, je.entry_number, je.memo, je.source_type, je.status,
             l.debit, l.credit
      FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
      WHERE l.account_id = ${params.id}::uuid AND je.org_id = ${orgId}::uuid AND je.status = 'posted'
      ORDER BY je.entry_date DESC, je.created_at DESC LIMIT 100
    `) as unknown[];

    return ok({ ...rows[0], closing_debit: debit, closing_credit: credit, transactions });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = accountSchema.partial().safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The account is invalid.", details: parsed.error.flatten() });
  const input = parsed.data;

  try {
    const existing = (await prisma.$queryRaw`SELECT is_system, account_type FROM accounts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ is_system: boolean; account_type: string }>;
    if (!existing.length) return fail(404, { code: "NOT_FOUND", message: "Account was not found." });
    const isSystem = existing[0].is_system;
    // System accounts keep their type and stay active (Zoho locks these).
    const accountType = isSystem ? existing[0].account_type : input.account_type ?? existing[0].account_type;
    const isActive = isSystem ? true : input.is_active;

    await prisma.$executeRaw`
      UPDATE accounts SET
        name = COALESCE(${input.name ?? null}, name),
        code = ${input.code ?? null},
        description = ${input.description ?? null},
        account_type = ${accountType},
        parent_id = ${input.parent_id ?? null}::uuid,
        currency = COALESCE(${input.currency ?? null}, currency),
        is_active = COALESCE(${isActive ?? null}, is_active),
        show_on_dashboard = COALESCE(${input.show_on_dashboard ?? null}, show_on_dashboard),
        updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "account", entity_id: params.id, action: "update", new_values: { name: input.name, account_type: accountType } });
    const rows = (await prisma.$queryRaw`SELECT * FROM accounts WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT is_system FROM accounts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ is_system: boolean }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Account was not found." });
    if (rows[0].is_system) return fail(409, { code: "SYSTEM_ACCOUNT", message: "System accounts cannot be deleted." });

    const used = (await prisma.$queryRaw`SELECT 1 FROM journal_entry_lines WHERE account_id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (used.length) return fail(409, { code: "ACCOUNT_IN_USE", message: "This account has transactions and cannot be deleted. Mark it inactive instead." });

    await prisma.$executeRaw`DELETE FROM accounts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "account", entity_id: params.id, action: "delete", new_values: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
