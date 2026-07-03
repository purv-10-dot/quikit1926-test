import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { assertPeriodUnlocked } from "@/lib/period-locks";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { loadInvoiceSettings } from "@/lib/settings/invoice";

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
      SELECT COUNT(*)::bigint AS count FROM invoices
      WHERE org_id = ${orgId}::uuid
        AND (${search}::text IS NULL OR invoice_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    const data = (await prisma.$queryRaw`
      SELECT i.*, to_char(i.issue_date,'YYYY-MM-DD') AS date,
             c.display_name AS customer_name, w.name AS location
      FROM invoices i
      LEFT JOIN contacts c ON c.id = i.contact_id
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE i.org_id = ${orgId}::uuid
        AND (${search}::text IS NULL OR i.invoice_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY i.created_at DESC
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
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The invoice is invalid.", details: parsed.error.flatten() });
  }

  const locked = await assertPeriodUnlocked(auth.context, parsed.data.issue_date, "sales");
  if (locked) return locked;

  // Invoice numbering (Settings → Invoices): require a number when auto-generate is off.
  const numbering = await loadInvoiceSettings(prisma, orgId);
  const providedNumber = parsed.data.invoice_number && parsed.data.invoice_number.length > 0;
  if (!providedNumber && !numbering.auto_generate_number) {
    return fail(422, { code: "INVOICE_NUMBER_REQUIRED", message: "Enter an invoice number, or enable auto-generation in Settings → Invoices." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let data = parsed.data;
      if (!providedNumber && numbering.auto_generate_number) {
        // Number from the location's transaction series (falls back to the org's
        // invoice numbering settings when no series covers invoices).
        data = { ...data, invoice_number: await nextDocumentNumber(tx, orgId, "invoice", { locationId: data.warehouse_id ?? null, fallbackPrefix: numbering.prefix, fallbackFloor: numbering.next_number }) };
      }
      return saveInvoice(tx, orgId, userId, data);
    });
    const rows = (await prisma.$queryRaw`SELECT * FROM invoices WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
