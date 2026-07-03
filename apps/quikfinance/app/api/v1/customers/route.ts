import type { NextRequest } from "next/server";
import { createCrudHandlers } from "@/lib/api/crud";
import { customerRouteConfig } from "@/lib/api/module-routes";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { customerSchema } from "@/lib/validations/customer.schema";
import { saveCustomer } from "@/lib/customers/service";

export const dynamic = "force-dynamic";

// Reuse the generic list handler (search, filters, pagination, RBAC, org scope).
const handlers = createCrudHandlers(customerRouteConfig);
export const GET = handlers.GET;

/** Create a customer with nested children (persons, banks, documents). */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The customer is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveCustomer(tx, orgId, userId, parsed.data));
    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      entity_type: "customer",
      entity_id: result.id,
      action: "create",
      new_values: { display_name: parsed.data.display_name, customer_category: parsed.data.customer_category }
    });
    const rows = (await prisma.$queryRaw`SELECT * FROM contacts WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
