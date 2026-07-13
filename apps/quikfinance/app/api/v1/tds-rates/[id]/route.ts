import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { tdsRateSchema } from "@/lib/validations/tds-rate.schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: RouteContext) {
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
    await prisma.$executeRaw`
      UPDATE tds_rates SET name = ${d.name}, rate = ${d.rate}, tax_act = ${d.tax_act}, section = ${d.section ?? null},
        higher_rate = ${d.higher_rate}, start_date = ${d.start_date ?? null}::date, end_date = ${d.end_date ?? null}::date,
        is_active = ${d.is_active}, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`SELECT * FROM tds_rates WHERE id = ${params.id}::uuid`) as unknown[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "TDS rate was not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can manage TDS rates." });
  try {
    await prisma.$executeRaw`DELETE FROM tds_rates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
