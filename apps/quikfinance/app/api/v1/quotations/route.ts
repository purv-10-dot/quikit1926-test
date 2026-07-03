import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { quotationSchema } from "@/lib/validations/commercial.schema";
import { saveQuotation } from "@/lib/accounting/quotation-service";

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
      SELECT COUNT(*)::bigint AS count FROM quotations
      WHERE org_id = ${orgId}::uuid
        AND (${search}::text IS NULL OR quotation_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    // Join customer + location so the list can show their names directly.
    const data = (await prisma.$queryRaw`
      SELECT q.*, to_char(q.issue_date,'YYYY-MM-DD') AS date,
             c.display_name AS customer_name, w.name AS location
      FROM quotations q
      LEFT JOIN contacts c ON c.id = q.contact_id
      LEFT JOIN warehouses w ON w.id = q.warehouse_id
      WHERE q.org_id = ${orgId}::uuid
        AND (${search}::text IS NULL OR q.quotation_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY q.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}
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

  const moduleOff = await assertModuleEnabled(auth.context, "quotes");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = quotationSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The quote is invalid.", details: parsed.error.flatten() });

  try {
    // Robust auto-numbering: if a supplied number collides (stale form preview or a
    // concurrent create), drop it and let the server generate a fresh one, then retry.
    let data = parsed.data;
    let result: { id: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await prisma.$transaction((tx) => saveQuotation(tx, orgId, userId, data));
        break;
      } catch (error) {
        const msg = errorMessage(error);
        const isNumberCollision = /quotation_number/i.test(msg) && /(already exists|duplicate|unique|23505)/i.test(msg);
        if (isNumberCollision && attempt < 2) { data = { ...data, quotation_number: undefined }; continue; }
        throw error;
      }
    }
    if (!result) throw new Error("Could not save the quote.");
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: result.id, action: "create", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM quotations WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
