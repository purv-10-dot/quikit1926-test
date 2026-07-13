import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { vendorCreditSchema } from "@/lib/validations/commercial.schema";
import { saveVendorCredit } from "@/lib/accounting/credit-note-service";

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
      SELECT COUNT(*)::bigint AS count FROM vendor_credits
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR vendor_credit_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);
    const data = (await prisma.$queryRaw`
      SELECT vc.*, to_char(vc.issue_date,'YYYY-MM-DD') AS date,
             c.display_name AS vendor_name, w.name AS location, b.bill_number AS bill_no
      FROM vendor_credits vc
      LEFT JOIN contacts c ON c.id = vc.contact_id
      LEFT JOIN warehouses w ON w.id = vc.warehouse_id
      LEFT JOIN bills b ON b.id = vc.bill_id
      WHERE vc.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR vc.vendor_credit_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY vc.created_at DESC LIMIT ${perPage} OFFSET ${offset}
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

  const moduleOff = await assertModuleEnabled(auth.context, "vendor_credits");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = vendorCreditSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The vendor credit is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveVendorCredit(tx, orgId, userId, parsed.data));
    const rows = (await prisma.$queryRaw`SELECT * FROM vendor_credits WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
