import type { NextRequest } from "next/server";
import { createCrudHandlers } from "@/lib/api/crud";
import { vendorRouteConfig } from "@/lib/api/module-routes";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { vendorSchema } from "@/lib/validations/vendor.schema";
import { saveCustomer } from "@/lib/customers/service";

export const dynamic = "force-dynamic";

const handlers = createCrudHandlers(vendorRouteConfig);
export const GET = handlers.GET;

/** Create a vendor with nested children (persons, banks, documents). */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }

  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The vendor is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveCustomer(tx, orgId, userId, parsed.data, undefined, "vendor"));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "vendor", entity_id: result.id, action: "create", new_values: { display_name: parsed.data.display_name } });
    const rows = (await prisma.$queryRaw`SELECT * FROM contacts WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
