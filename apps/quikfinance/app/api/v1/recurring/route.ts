import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";

export const dynamic = "force-dynamic";

const recurringSchema = z.object({
  source_type: z.enum(["invoice", "bill"]),
  source_id: z.string().uuid(),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "annually"]),
  start_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  end_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional().nullable(),
  occurrence_count: z.coerce.number().int().positive().optional().nullable()
});

export async function GET(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const data = (await prisma.$queryRaw`
      SELECT r.id, r.source_type, r.source_id, r.profile_name, r.order_number, r.frequency,
             to_char(r.start_date,'YYYY-MM-DD') AS start_date,
             to_char(r.end_date,'YYYY-MM-DD') AS end_date,
             to_char(r.next_run_date,'YYYY-MM-DD') AS next_run_date,
             r.occurrence_count, r.is_active,
             c.display_name AS customer_name, COALESCE(inv.total, bl.total) AS amount
      FROM recurring_transactions r
      LEFT JOIN invoices inv ON inv.id = r.source_id AND r.source_type = 'invoice'
      LEFT JOIN bills bl ON bl.id = r.source_id AND r.source_type = 'bill'
      LEFT JOIN contacts c ON c.id = COALESCE(inv.contact_id, bl.contact_id)
      WHERE r.org_id = ${orgId}::uuid ORDER BY r.created_at DESC
    `) as unknown[];
    return ok(data);
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const moduleOff = await assertModuleEnabled(auth.context, "recurring");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = recurringSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The recurring profile is invalid.", details: parsed.error.flatten() });
  }
  const input = parsed.data;

  try {
    const rows = (await prisma.$queryRaw`
      INSERT INTO recurring_transactions (org_id, source_type, source_id, frequency, start_date, end_date, occurrence_count, next_run_date, is_active)
      VALUES (${orgId}::uuid, ${input.source_type}, ${input.source_id}::uuid, ${input.frequency}, ${input.start_date}::date,
        ${input.end_date ?? null}::date, ${input.occurrence_count ?? null}, ${input.start_date}::date, true)
      RETURNING id`) as Array<{ id: string }>;
    return ok({ id: rows[0].id }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
