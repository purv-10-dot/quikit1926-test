import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Cancel a purchase order (Zoho: → Cancelled). Billed orders cannot be cancelled. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT status, bill_id FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ status: string; bill_id: string | null }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    if (rows[0].status === "billed" || rows[0].bill_id) return fail(409, { code: "INVALID_STATE", message: "A billed purchase order cannot be cancelled. Delete the bill first." });
    await prisma.$executeRaw`UPDATE purchase_orders SET status = 'cancelled', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "cancel", new_values: { status: "cancelled" } });
    return ok({ id: params.id, status: "cancelled" });
  } catch (error) {
    return fail(400, { code: "CANCEL_FAILED", message: errorMessage(error) });
  }
}
