import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const UploadSchema = z.object({
  period_month: z.coerce.number().int().min(1).max(12),
  period_year: z.coerce.number().int().min(2017),
  items: z.array(
    z.object({
      supplier_gstin: z.string().min(1),
      supplier_name: z.string().optional().nullable(),
      invoice_number: z.string().optional().nullable(),
      invoice_date: z.string().optional().nullable(),
      taxable_value_2b: z.coerce.number().default(0),
      tax_2b: z.coerce.number().default(0)
    })
  ).min(1)
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const status = searchParams.get("status");

  try {
    let query = db
      .from("gst_reconciliation_items")
      .select("*")
      .eq("org_id", orgId)
      .eq("period_month", month)
      .eq("period_year", year)
      .order("supplier_gstin");

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const items = data ?? [];
    const summary = {
      total: items.length,
      matched: items.filter((i) => i.status === "matched").length,
      mismatched: items.filter((i) => i.status === "mismatch").length,
      missing_in_books: items.filter((i) => i.status === "missing_in_books").length,
      missing_in_2b: items.filter((i) => i.status === "missing_in_2b").length,
      total_itc_2b: items.reduce((s, i) => s + Number(i.tax_2b ?? 0), 0),
      total_itc_books: items.reduce((s, i) => s + Number(i.tax_books ?? 0), 0)
    };

    return ok(items, { summary });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, prisma, orgId, userId, role } = auth.context;

  if (!["owner", "admin", "accountant"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Insufficient permissions." });
  }

  try {
    const body = await req.json();
    const parsed = UploadSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { period_month, period_year, items } = parsed.data;
    const startDate = `${period_year}-${String(period_month).padStart(2, "0")}-01`;
    const endDate = new Date(period_year, period_month, 0).toISOString().split("T")[0];

    // Fetch books data for this period (bill lines joined to bills + supplier).
    const billLines = await prisma.$queryRaw<Array<{ total: number | string | null; tax_amount: number | string | null; gstin: string | null }>>`
      SELECT bl.line_total AS total, bl.tax_amount, c.tax_id AS gstin
      FROM bill_lines bl
      JOIN bills b ON b.id = bl.bill_id
      LEFT JOIN contacts c ON c.id = b.contact_id
      WHERE b.org_id = ${orgId}::uuid
        AND b.issue_date >= ${startDate}::date
        AND b.issue_date <= ${endDate}::date
        AND b.status <> 'draft'`;

    // Map books data by GSTIN
    const booksMap = new Map<string, { taxable: number; tax: number }>();
    for (const line of billLines) {
      const gstin = line.gstin ?? "";
      if (!gstin) continue;
      const existing = booksMap.get(gstin) ?? { taxable: 0, tax: 0 };
      existing.taxable += Number(line.total ?? 0);
      existing.tax += Number(line.tax_amount ?? 0);
      booksMap.set(gstin, existing);
    }

    // Delete existing recon items for this period
    await db
      .from("gst_reconciliation_items")
      .delete()
      .eq("org_id", orgId)
      .eq("period_month", period_month)
      .eq("period_year", period_year);

    // Build reconciliation rows
    const reconItems = items.map((item) => {
      const books = booksMap.get(item.supplier_gstin);
      let status: string;
      if (!books) {
        status = "missing_in_books";
      } else {
        const taxDiff = Math.abs((books.tax) - item.tax_2b);
        status = taxDiff < 1 ? "matched" : "mismatch";
      }

      return {
        org_id: orgId,
        period_month,
        period_year,
        supplier_gstin: item.supplier_gstin,
        supplier_name: item.supplier_name ?? null,
        invoice_number: item.invoice_number ?? null,
        invoice_date: item.invoice_date ?? null,
        taxable_value_books: books?.taxable ?? null,
        tax_books: books?.tax ?? null,
        taxable_value_2b: item.taxable_value_2b,
        tax_2b: item.tax_2b,
        status
      };
    });

    // Add missing_in_2b items from books
    for (const [gstin, books] of booksMap.entries()) {
      if (!items.find((i) => i.supplier_gstin === gstin)) {
        reconItems.push({
          org_id: orgId,
          period_month,
          period_year,
          supplier_gstin: gstin,
          supplier_name: null,
          invoice_number: null,
          invoice_date: null,
          taxable_value_books: books.taxable,
          tax_books: books.tax,
          taxable_value_2b: Number(null),
          tax_2b: Number(null),
          status: "missing_in_2b"
        });
      }
    }

    const { error: insertErr } = await db.from("gst_reconciliation_items").insert(reconItems);
    if (insertErr) throw insertErr;

    // Upsert gst_returns record
    await db.from("gst_returns").upsert({
      org_id: orgId,
      return_type: "gstr2b",
      period_month,
      period_year,
      status: "draft",
      total_igst: items.reduce((s, i) => s + i.tax_2b, 0),
      updated_at: new Date().toISOString()
    }, { onConflict: "org_id,return_type,period_month,period_year" });

    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "create",
      entity_type: "gstr2b_upload",
      entity_id: orgId,
      new_values: { period_month, period_year, item_count: items.length }
    });

    return ok({ uploaded: reconItems.length, matched: reconItems.filter((i) => i.status === "matched").length });
  } catch (e) {
    return fail(500, { code: "UPLOAD_ERROR", message: errorMessage(e) });
  }
}
