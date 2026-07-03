import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { billSchema } from "@/lib/validations/bill.schema";
import { saveBill } from "@/lib/accounting/bill-service";
import { assertPeriodUnlocked } from "@/lib/period-locks";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

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
      SELECT COUNT(*)::bigint AS count FROM bills
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR bill_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    const data = (await prisma.$queryRaw`
      SELECT b.*, to_char(b.issue_date,'YYYY-MM-DD') AS date,
             b.vendor_reference AS reference_number,
             c.display_name AS vendor_name, w.name AS location
      FROM bills b
      LEFT JOIN contacts c ON c.id = b.contact_id
      LEFT JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR b.bill_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY b.created_at DESC LIMIT ${perPage} OFFSET ${offset}
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

  const parsed = billSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The bill is invalid.", details: parsed.error.flatten() });
  }

  const locked = await assertPeriodUnlocked(auth.context, parsed.data.issue_date, "purchases");
  if (locked) return locked;

  try {
    const data = { ...parsed.data };
    if (!data.bill_number || data.bill_number.length === 0) {
      data.bill_number = await nextDocumentNumber(prisma, orgId, "bill", { locationId: data.warehouse_id ?? null });
    }
    const result = await prisma.$transaction((tx) => saveBill(tx, orgId, userId, data));
    const rows = (await prisma.$queryRaw`SELECT * FROM bills WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
