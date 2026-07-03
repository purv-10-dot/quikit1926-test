import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Mark a sales order as confirmed. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const rows = (await prisma.$executeRaw`UPDATE sales_orders SET status = 'confirmed', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`) as number;
    if (!rows) return fail(404, { code: "NOT_FOUND", message: "Sales order was not found." });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: params.id, action: "confirm", new_values: { status: "confirmed" } });
    return ok({ id: params.id, status: "confirmed" });
  } catch (error) {
    return fail(400, { code: "CONFIRM_FAILED", message: errorMessage(error) });
  }
}
