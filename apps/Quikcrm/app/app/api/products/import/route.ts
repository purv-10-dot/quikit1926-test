/**
 * POST /api/products/import
 *
 * Bulk-create products from a JSON array (the CSV/XLSX parsing happens
 * client-side using the already-installed `xlsx` lib — we receive the
 * already-parsed rows, validate them, and bulk-create. Keeping the
 * parse client-side avoids needing multipart/form-data handling +
 * keeps the server route stateless.
 *
 * Idempotency: `createMany({ skipDuplicates: true })` against the
 * `(orgId, sku)` unique constraint means re-running the same import
 * twice is safe — duplicates are silently ignored, the count returned
 * reflects only new rows.
 *
 * Error model: per-row validation errors are aggregated and returned —
 * one bad row doesn't poison the whole import. The caller decides
 * whether to retry, fix-and-resubmit, or accept the partial result.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createProductSchema } from "@/lib/services/quotes/validators";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

// Wrap each row in the create schema; the import endpoint expects an
// array. Per-row failures are returned, the rest of the batch proceeds.
const importBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(1000, "Max 1000 rows per import"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    const body = await req.json().catch(() => null);
    const parsed = importBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Invalid body: expected { rows: [...] } with up to 1000 entries");
    }

    const validRows: Array<{
      orgId: string;
      name: string;
      sku: string;
      category: string | null;
      hsnCode: string | null;
      unitGroup: string;
      defaultUnit: string;
      listPrice: number;
      currency: string;
      gstRate: number;
      productType: "Product" | "Service" | "Bundle";
      isActive: boolean;
      createdByUserId: string;
    }> = [];
    const errors: Array<{ row: number; error: string }> = [];

    parsed.data.rows.forEach((raw, idx) => {
      const v = createProductSchema.safeParse(raw);
      if (!v.success) {
        errors.push({
          row: idx + 2, // +2 because rows usually have a header row (1-based + header offset)
          error: v.error.issues
            .map((i) => `${i.path.join(".") || "row"}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      const r = v.data;
      validRows.push({
        orgId: user.orgId,
        name: r.name,
        sku: r.sku,
        category: r.category ?? null,
        hsnCode: r.hsnCode ?? null,
        unitGroup: r.unitGroup ?? "Each",
        defaultUnit: r.defaultUnit ?? r.unitGroup ?? "Each",
        listPrice: r.listPrice,
        currency: (r.currency ?? "INR").toUpperCase(),
        gstRate: r.gstRate,
        productType: r.productType ?? "Product",
        isActive: r.isActive ?? true,
        createdByUserId: user.userId,
      });
    });

    let createdCount = 0;
    if (validRows.length > 0) {
      // skipDuplicates relies on the @@unique([orgId, sku]) index —
      // if a SKU is re-imported, Prisma silently skips it. This is the
      // "safe to re-run" property we want for bulk CSV imports.
      const result = await db.crmProduct.createMany({
        data: validRows,
        skipDuplicates: true,
      });
      createdCount = result.count;
    }

    return ok({
      attempted: parsed.data.rows.length,
      created: createdCount,
      skippedDuplicates: validRows.length - createdCount,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to import products";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products/import POST]", error);
    return fail(status, message);
  }
}
