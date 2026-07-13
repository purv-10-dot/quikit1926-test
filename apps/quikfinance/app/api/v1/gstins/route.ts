import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { isIndia } from "@/lib/gst";
import { gstinSchema, associateLocations } from "@/lib/gstin-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
    const orgRows = (await prisma.$queryRaw`SELECT country FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ country: string | null }>;
    if (!isIndia(orgRows[0]?.country)) return fail(409, { code: "NOT_INDIA", message: "GSTINs are only available for India-based organizations." });

    const rows = (await prisma.$queryRaw`
      INSERT INTO gstins (org_id, gstin, registration_type, legal_name, trade_name, registered_on, reverse_charge, sez, digital_services)
      VALUES (${orgId}::uuid, ${d.gstin}, ${d.registration_type}, ${d.legal_name ?? null}, ${d.trade_name ?? null}, ${d.registered_on ?? null}::date, ${d.reverse_charge}, ${d.sez}, ${d.digital_services})
      RETURNING *`) as Array<{ id: string }>;
    await associateLocations(prisma, orgId, rows[0].id, d.location_ids);
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
