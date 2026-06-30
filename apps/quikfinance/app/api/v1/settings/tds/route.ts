import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { isIndia } from "@/lib/gst";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const orgRows = (await prisma.$queryRaw`SELECT country, tds_apply_level, tds_liabilities_report FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ country: string | null; tds_apply_level: string; tds_liabilities_report: boolean }>;
    const rates = (await prisma.$queryRaw`
      SELECT *, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date
      FROM tds_rates WHERE org_id = ${orgId}::uuid ORDER BY name ASC
    `) as unknown[];
    return ok({
      available: isIndia(orgRows[0]?.country),
      country: orgRows[0]?.country ?? null,
      apply_level: orgRows[0]?.tds_apply_level ?? "transaction",
      liabilities_report: Boolean(orgRows[0]?.tds_liabilities_report),
      rates
    });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can change TDS settings." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = z.object({
    apply_level: z.enum(["transaction", "line_item"]).optional(),
    liabilities_report: z.boolean().optional()
  }).safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid TDS settings." });

  try {
    await prisma.$executeRaw`
      UPDATE organizations SET
        tds_apply_level = COALESCE(${parsed.data.apply_level ?? null}, tds_apply_level),
        tds_liabilities_report = COALESCE(${parsed.data.liabilities_report ?? null}, tds_liabilities_report),
        updated_at = now()
      WHERE id = ${orgId}::uuid`;
    return ok({ ...parsed.data });
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
