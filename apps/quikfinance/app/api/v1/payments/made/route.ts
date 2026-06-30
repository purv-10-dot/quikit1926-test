import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { moneySchema } from "@/lib/validations/common.schema";
import { postPaymentMade, resolveControlAccounts, round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { syncAttachments } from "@/lib/accounting/attachments";

export const dynamic = "force-dynamic";

const madePaymentSchema = z.object({
  contact_id: z.string().uuid(),
  payment_number: z.string().trim().max(40).optional(),
  warehouse_id: z.string().uuid().optional().nullable(),
  payment_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  amount: moneySchema,
  method: z.string().trim().min(1).max(80).default("Bank Transfer"),
  reference: z.string().trim().max(120).optional().nullable(),
  currency: z.string().trim().length(3).default("INR"),
  payment_account_id: z.string().uuid(),
  memo: z.string().max(1000).optional().nullable(),
  allocations: z.array(z.object({ bill_id: z.string().uuid(), amount: moneySchema })).min(1),
  attachments: z.array(z.object({
    id: z.string().uuid().optional(),
    file_name: z.string().trim().min(1).max(255),
    content_type: z.string().max(200).optional().nullable(),
    size_bytes: z.coerce.number().int().min(0).default(0),
    data: z.string().max(20_000_000).optional().nullable()
  })).optional()
});

/** List payments made with vendor, location, and applied bill numbers. */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
  const offset = (page - 1) * perPage;
  try {
    const countRows = (await prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM payments WHERE org_id = ${orgId}::uuid AND payment_type = 'made'`) as Array<{ count: bigint }>;
    const data = (await prisma.$queryRaw`
      SELECT p.*, to_char(p.payment_date,'YYYY-MM-DD') AS date, p.method AS mode,
             c.display_name AS vendor_name, w.name AS location,
             (SELECT string_agg(b.bill_number, ', ') FROM payment_allocations pa JOIN bills b ON b.id = pa.bill_id WHERE pa.payment_id = p.id) AS bill_no
      FROM payments p
      LEFT JOIN contacts c ON c.id = p.contact_id
      LEFT JOIN warehouses w ON w.id = p.warehouse_id
      WHERE p.org_id = ${orgId}::uuid AND p.payment_type = 'made'
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];
    return ok(data, { total: Number(countRows[0]?.count ?? 0), page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = madePaymentSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The payment is invalid.", details: parsed.error.flatten() });
  const input = parsed.data;

  const allocatedSum = round2(input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  if (allocatedSum > round2(input.amount) + 0.001) return fail(422, { code: "OVER_ALLOCATED", message: "Allocated amount exceeds the payment amount." });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const accounts = await resolveControlAccounts(tx, orgId);
      const unapplied = round2(input.amount - allocatedSum);
      const paymentNumber = input.payment_number && input.payment_number.length > 0 ? input.payment_number : await nextDocumentNumber(tx, orgId, "payment_made", { locationId: input.warehouse_id ?? null });

      const paymentRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO payments (
          org_id, contact_id, payment_type, payment_number, warehouse_id, payment_date, amount, unapplied_amount, currency,
          method, reference, deposit_account_id, status, memo
        ) VALUES (
          ${orgId}::uuid, ${input.contact_id}::uuid, 'made', ${paymentNumber}, ${input.warehouse_id ?? null}::uuid, ${input.payment_date}::date, ${round2(input.amount)},
          ${unapplied}, ${input.currency}, ${input.method}, ${input.reference ?? null}, ${input.payment_account_id}::uuid,
          'posted', ${input.memo ?? null}
        ) RETURNING id`;
      const paymentId = paymentRows[0].id;

      for (const allocation of input.allocations) {
        const amount = round2(allocation.amount);
        if (amount <= 0) continue;
        await tx.$executeRaw`INSERT INTO payment_allocations (org_id, payment_id, bill_id, amount) VALUES (${orgId}::uuid, ${paymentId}::uuid, ${allocation.bill_id}::uuid, ${amount})`;
        await tx.$executeRaw`
          UPDATE bills SET balance_due = GREATEST(0, ROUND(balance_due - ${amount}, 2)),
            status = CASE WHEN ROUND(balance_due - ${amount}, 2) <= 0 THEN 'paid' ELSE 'partial' END, updated_at = now()
          WHERE id = ${allocation.bill_id}::uuid AND org_id = ${orgId}::uuid`;
      }

      const journalEntryId = await postPaymentMade(tx, orgId, userId, { id: paymentId, payment_date: input.payment_date, amount: input.amount, reference: input.reference }, input.payment_account_id, accounts);
      await tx.$executeRaw`UPDATE payments SET journal_entry_id = ${journalEntryId}::uuid WHERE id = ${paymentId}::uuid`;
      await syncAttachments(tx, orgId, "payment", paymentId, userId, input.attachments);
      return { id: paymentId };
    });

    const rows = (await prisma.$queryRaw`SELECT * FROM payments WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "PAYMENT_FAILED", message: errorMessage(error) });
  }
}

/** Edit a payment made: reverse its prior effect, then re-apply the new values. */
export async function PUT(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const paymentId = request.nextUrl.searchParams.get("id");
  if (!paymentId) return fail(422, { code: "ID_REQUIRED", message: "A payment id is required." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = madePaymentSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The payment is invalid.", details: parsed.error.flatten() });
  const input = parsed.data;

  const allocatedSum = round2(input.allocations.reduce((sum, a) => sum + a.amount, 0));
  if (allocatedSum > round2(input.amount) + 0.001) return fail(422, { code: "OVER_ALLOCATED", message: "Allocated amount exceeds the payment amount." });

  try {
    await prisma.$transaction(async (tx) => {
      const existing = (await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND org_id = ${orgId}::uuid AND payment_type = 'made' LIMIT 1`) as unknown[];
      if (!existing.length) throw new Error("Payment was not found.");

      const oldAllocs = (await tx.$queryRaw`SELECT bill_id, amount FROM payment_allocations WHERE payment_id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`) as Array<{ bill_id: string; amount: string }>;
      for (const a of oldAllocs) {
        await tx.$executeRaw`
          UPDATE bills SET balance_due = ROUND(balance_due + ${round2(Number(a.amount))}, 2),
            status = CASE WHEN ROUND(balance_due + ${round2(Number(a.amount))}, 2) >= ROUND(total - tds_amount, 2) THEN 'open' ELSE 'partial' END, updated_at = now()
          WHERE id = ${a.bill_id}::uuid AND org_id = ${orgId}::uuid`;
      }
      await tx.$executeRaw`DELETE FROM payment_allocations WHERE payment_id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`;

      const accounts = await resolveControlAccounts(tx, orgId);
      const unapplied = round2(input.amount - allocatedSum);
      await tx.$executeRaw`
        UPDATE payments SET contact_id = ${input.contact_id}::uuid, warehouse_id = ${input.warehouse_id ?? null}::uuid,
          payment_date = ${input.payment_date}::date, amount = ${round2(input.amount)}, unapplied_amount = ${unapplied}, currency = ${input.currency},
          method = ${input.method}, reference = ${input.reference ?? null}, deposit_account_id = ${input.payment_account_id}::uuid, memo = ${input.memo ?? null}, updated_at = now()
        WHERE id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`;

      for (const allocation of input.allocations) {
        const amount = round2(allocation.amount);
        if (amount <= 0) continue;
        await tx.$executeRaw`INSERT INTO payment_allocations (org_id, payment_id, bill_id, amount) VALUES (${orgId}::uuid, ${paymentId}::uuid, ${allocation.bill_id}::uuid, ${amount})`;
        await tx.$executeRaw`
          UPDATE bills SET balance_due = GREATEST(0, ROUND(balance_due - ${amount}, 2)),
            status = CASE WHEN ROUND(balance_due - ${amount}, 2) <= 0 THEN 'paid' ELSE 'partial' END, updated_at = now()
          WHERE id = ${allocation.bill_id}::uuid AND org_id = ${orgId}::uuid`;
      }

      const journalEntryId = await postPaymentMade(tx, orgId, userId, { id: paymentId, payment_date: input.payment_date, amount: input.amount, reference: input.reference }, input.payment_account_id, accounts);
      await tx.$executeRaw`UPDATE payments SET journal_entry_id = ${journalEntryId}::uuid WHERE id = ${paymentId}::uuid`;
      await syncAttachments(tx, orgId, "payment", paymentId, userId, input.attachments);
    });
    const rows = (await prisma.$queryRaw`SELECT * FROM payments WHERE id = ${paymentId}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "PAYMENT_UPDATE_FAILED", message: errorMessage(error) });
  }
}
