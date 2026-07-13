import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);

/** CA portal TDS summary — tax deducted at source on vendor bills, by deductee. */
export async function GET() {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT c.display_name AS vendor, c.tax_id AS gstin, c.pan,
             COUNT(*)::int AS bills, COALESCE(SUM(b.tds_amount),0) AS tds, COALESCE(SUM(b.total),0) AS gross
      FROM bills b JOIN contacts c ON c.id = b.contact_id
      WHERE b.org_id = ${orgId}::uuid AND COALESCE(b.tds_amount,0) > 0
      GROUP BY c.display_name, c.tax_id, c.pan
      ORDER BY tds DESC
    `) as Array<{ vendor: string; gstin: string | null; pan: string | null; bills: number; tds: string; gross: string }>;
    const totalTds = rows.reduce((s, r) => s + n(r.tds), 0);
    const totalGross = rows.reduce((s, r) => s + n(r.gross), 0);
    return ok({ rows, totals: { tds: totalTds, gross: totalGross, deductees: rows.length } });
  } catch (error) {
    return fail(500, { code: "CA_TDS_FAILED", message: errorMessage(error) });
  }
}
