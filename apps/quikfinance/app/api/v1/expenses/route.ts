import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { expenseInputSchema, saveExpense } from "@/lib/accounting/expense-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
  const offset = (page - 1) * perPage;
  const search = request.nextUrl.searchParams.get("search");

  try {
    const countRows = (await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count FROM expenses
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR description ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);
    const data = (await prisma.$queryRaw`
      SELECT e.*, to_char(e.expense_date,'YYYY-MM-DD') AS date,
             a.name AS account_name, v.display_name AS vendor_name, cu.display_name AS customer_name, w.name AS location,
             CASE WHEN e.is_billable THEN 'Billable' ELSE 'Non-billable' END AS billable_label
      FROM expenses e
      LEFT JOIN accounts a ON a.id = e.account_id
      LEFT JOIN contacts v ON v.id = e.vendor_id
      LEFT JOIN contacts cu ON cu.id = e.customer_id
      LEFT JOIN warehouses w ON w.id = e.warehouse_id
      WHERE e.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR e.description ILIKE ${`%${search ?? ""}%`})
      ORDER BY e.expense_date DESC, e.created_at DESC LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];
    return ok(data, { total, page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
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
    const result = await prisma.$transaction((tx) => saveExpense(tx, orgId, userId, parsed.data));
    const rows = (await prisma.$queryRaw`SELECT * FROM expenses WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
