import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { creditNoteSchema } from "@/lib/validations/commercial.schema";
import { saveCreditNote } from "@/lib/accounting/credit-note-service";

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
      SELECT COUNT(*)::bigint AS count FROM credit_notes
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR credit_note_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);
    const data = (await prisma.$queryRaw`
      SELECT cn.*, to_char(cn.issue_date,'YYYY-MM-DD') AS date,
             c.display_name AS customer_name, w.name AS location, i.invoice_number AS invoice_no
      FROM credit_notes cn
      LEFT JOIN contacts c ON c.id = cn.contact_id
      LEFT JOIN warehouses w ON w.id = cn.warehouse_id
      LEFT JOIN invoices i ON i.id = cn.invoice_id
      WHERE cn.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR cn.credit_note_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY cn.created_at DESC LIMIT ${perPage} OFFSET ${offset}
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

  const moduleOff = await assertModuleEnabled(auth.context, "credit_notes");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = creditNoteSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The credit note is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveCreditNote(tx, orgId, userId, parsed.data));
    const rows = (await prisma.$queryRaw`SELECT * FROM credit_notes WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
