import type { NextRequest } from "next/server";
import { createCrudItemHandlers } from "@/lib/api/crud";
import { customerRouteConfig } from "@/lib/api/module-routes";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { customerSchema } from "@/lib/validations/customer.schema";
import { saveCustomer, loadCustomer } from "@/lib/customers/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

// Reuse the generic DELETE (RBAC, org scope, audit). Child rows cascade-delete.
const handlers = createCrudItemHandlers(customerRouteConfig);
export const DELETE = handlers.DELETE;

/** Full customer with nested children + computed KPIs. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const customer = await prisma.$transaction((tx) => loadCustomer(tx, orgId, params.id));
    if (!customer) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });
    return ok(customer);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

/** Update a customer + nested children. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
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
    const exists = (await prisma.$queryRaw`SELECT id FROM contacts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND type = 'customer' LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });

    await prisma.$transaction((tx) => saveCustomer(tx, orgId, userId, parsed.data, params.id));
    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      entity_type: "customer",
      entity_id: params.id,
      action: "update",
      new_values: { display_name: parsed.data.display_name }
    });
    const rows = (await prisma.$queryRaw`SELECT * FROM contacts WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
