import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { budgetSchema } from "@/lib/validations/operations.schema";
import { saveBudget } from "@/lib/accounting/budget-service";

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
      SELECT COUNT(*)::bigint AS count FROM budgets WHERE org_id = ${orgId}::uuid
        AND (${search}::text IS NULL OR name ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);
    const data = (await prisma.$queryRaw`
      SELECT b.*, d.name AS department_name, d.type AS department_type, w.name AS location_name
      FROM budgets b
      LEFT JOIN departments d ON d.id = b.department_id
      LEFT JOIN warehouses w ON w.id = b.location_id
      WHERE b.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR b.name ILIKE ${`%${search ?? ""}%`})
      ORDER BY b.fiscal_year DESC, b.created_at DESC LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];
    return ok(data, { total, page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  const moduleOff = await assertModuleEnabled(auth.context, "budgets");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = budgetSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The budget is invalid.", details: parsed.error.flatten() });
  if (!parsed.data.lines.some((l) => (l.amounts ?? []).some((a) => Number(a) !== 0))) {
    return fail(422, { code: "NO_ACCOUNTS", message: "Please select at least one account with a budgeted amount." });
  }

  try {
    const result = await prisma.$transaction((tx) => saveBudget(tx, orgId, parsed.data));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "budget", entity_id: result.id, action: "create", new_values: { name: parsed.data.name } });
    const rows = (await prisma.$queryRaw`SELECT * FROM budgets WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
