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
    const orgRows = (await prisma.$queryRaw`SELECT country, gst_registered FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ country: string | null; gst_registered: boolean }>;
    const available = isIndia(orgRows[0]?.country);
    const gstins = (await prisma.$queryRaw`
      SELECT g.*, to_char(g.registered_on,'YYYY-MM-DD') AS registered_on,
             COALESCE(json_agg(w.name ORDER BY w.name) FILTER (WHERE w.id IS NOT NULL), '[]') AS locations,
             COALESCE(json_agg(w.id) FILTER (WHERE w.id IS NOT NULL), '[]') AS location_ids
      FROM gstins g
      LEFT JOIN warehouses w ON w.gstin_id = g.id AND w.org_id = g.org_id
      WHERE g.org_id = ${orgId}::uuid
      GROUP BY g.id
      ORDER BY g.created_at ASC
    `) as unknown[];
    return ok({ available, country: orgRows[0]?.country ?? null, registered: Boolean(orgRows[0]?.gst_registered), gstins });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can change GST settings." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = z.object({ registered: z.boolean() }).safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid GST settings." });

  try {
    const orgRows = (await prisma.$queryRaw`SELECT country FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ country: string | null }>;
    if (parsed.data.registered && !isIndia(orgRows[0]?.country)) {
      return fail(409, { code: "NOT_INDIA", message: "GST can only be enabled for India-based organizations." });
    }
    if (parsed.data.registered) {
      const count = (await prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM gstins WHERE org_id = ${orgId}::uuid`) as Array<{ c: number }>;
      if ((count[0]?.c ?? 0) === 0) {
        return fail(409, { code: "GSTIN_REQUIRED", message: "Add at least one GSTIN and associate your active locations before enabling GST." });
      }
    }
    await prisma.$executeRaw`UPDATE organizations SET gst_registered = ${parsed.data.registered}, updated_at = now() WHERE id = ${orgId}::uuid`;
    return ok({ registered: parsed.data.registered });
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
