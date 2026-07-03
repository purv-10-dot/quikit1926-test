import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { isIndia } from "@/lib/gst";
import { tdsRateSchema } from "@/lib/validations/tds-rate.schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can manage TDS rates." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = tdsRateSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The TDS rate is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const orgRows = (await prisma.$queryRaw`SELECT country FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ country: string | null }>;
    if (!isIndia(orgRows[0]?.country)) return fail(409, { code: "NOT_INDIA", message: "TDS is only available for India-based organizations." });

    const rows = (await prisma.$queryRaw`
      INSERT INTO tds_rates (org_id, name, rate, tax_act, section, higher_rate, start_date, end_date, is_active)
      VALUES (${orgId}::uuid, ${d.name}, ${d.rate}, ${d.tax_act}, ${d.section ?? null}, ${d.higher_rate}, ${d.start_date ?? null}::date, ${d.end_date ?? null}::date, ${d.is_active})
      RETURNING *`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
