import type { NextRequest } from "next/server";
import { createCrudItemHandlers } from "@/lib/api/crud";
import { vendorRouteConfig } from "@/lib/api/module-routes";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { vendorSchema } from "@/lib/validations/vendor.schema";
import { saveCustomer, loadCustomer } from "@/lib/customers/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const handlers = createCrudItemHandlers(vendorRouteConfig);
export const DELETE = handlers.DELETE;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const vendor = await prisma.$transaction((tx) => loadCustomer(tx, orgId, params.id, "vendor"));
    if (!vendor) return fail(404, { code: "NOT_FOUND", message: "Vendor was not found." });
    return ok(vendor);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The vendor is invalid.", details: parsed.error.flatten() });

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM contacts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND type = 'vendor' LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Vendor was not found." });
    await prisma.$transaction((tx) => saveCustomer(tx, orgId, userId, parsed.data, params.id, "vendor"));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "vendor", entity_id: params.id, action: "update", new_values: { display_name: parsed.data.display_name } });
    const rows = (await prisma.$queryRaw`SELECT * FROM contacts WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
