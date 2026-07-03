import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const schema = z.object({
  bank_account_id: z.string().uuid(),
  transactions: z.array(z.object({
    date: z.string().trim().min(8),
    description: z.string().trim().max(500).optional().nullable(),
    payee: z.string().trim().max(200).optional().nullable(),
    reference: z.string().trim().max(120).optional().nullable(),
    // Signed: deposits positive, withdrawals negative.
    amount: z.coerce.number()
  })).min(1).max(2000)
});

/** Import bank statement lines into bank_transactions (status = uncategorized). */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can import statements." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid import payload.", details: parsed.error.flatten() });
  const { bank_account_id, transactions } = parsed.data;

  try {
    // Confirm the account belongs to this org.
    const acct = (await prisma.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${bank_account_id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ id: string }>;
    if (!acct[0]) return fail(404, { code: "NOT_FOUND", message: "Bank account not found." });

    const usable = transactions.filter((t) => round2(t.amount) !== 0);
    let imported = 0;
    await prisma.$transaction(async (tx) => {
      for (const t of usable) {
        await tx.$executeRaw`
          INSERT INTO bank_transactions (org_id, bank_account_id, transaction_date, description, payee, amount, reference, status)
          VALUES (${orgId}::uuid, ${bank_account_id}::uuid, ${t.date}::date, ${t.description ?? null}, ${t.payee ?? null}, ${round2(t.amount)}, ${t.reference ?? null}, 'uncategorized')`;
        imported += 1;
      }
    });
    return ok({ imported }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "IMPORT_FAILED", message: errorMessage(error) });
  }
}

/** List a bank account's imported transactions. */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const bankAccountId = request.nextUrl.searchParams.get("bank_account_id");
  if (!bankAccountId) return fail(422, { code: "ID_REQUIRED", message: "bank_account_id is required." });
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, to_char(transaction_date,'YYYY-MM-DD') AS date, description, payee, amount, reference, status
      FROM bank_transactions WHERE org_id = ${orgId}::uuid AND bank_account_id = ${bankAccountId}::uuid
      ORDER BY transaction_date DESC, created_at DESC LIMIT 500
    `) as Array<Record<string, unknown>>;
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
