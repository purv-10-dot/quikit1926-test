import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { gstinSchema, associateLocations } from "@/lib/gstin-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can manage GSTINs." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = gstinSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The GSTIN is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    await prisma.$executeRaw`
      UPDATE gstins SET gstin = ${d.gstin}, registration_type = ${d.registration_type}, legal_name = ${d.legal_name ?? null},
        trade_name = ${d.trade_name ?? null}, registered_on = ${d.registered_on ?? null}::date,
        reverse_charge = ${d.reverse_charge}, sez = ${d.sez}, digital_services = ${d.digital_services}, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await associateLocations(prisma, orgId, params.id, d.location_ids);
    const rows = (await prisma.$queryRaw`SELECT * FROM gstins WHERE id = ${params.id}::uuid`) as unknown[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "GSTIN was not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can manage GSTINs." });
  try {
    await prisma.$executeRaw`UPDATE warehouses SET gstin_id = NULL WHERE gstin_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await prisma.$executeRaw`DELETE FROM gstins WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    // If no GSTINs remain, GST can no longer be considered enabled.
    const remaining = (await prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM gstins WHERE org_id = ${orgId}::uuid`) as Array<{ c: number }>;
    if ((remaining[0]?.c ?? 0) === 0) await prisma.$executeRaw`UPDATE organizations SET gst_registered = false WHERE id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
