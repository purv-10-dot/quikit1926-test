import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Mark a purchase order's goods as received (Zoho: Issued → Received). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT status FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ status: string }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    if (["draft", "cancelled"].includes(rows[0].status)) return fail(409, { code: "INVALID_STATE", message: "Issue the purchase order before marking it received." });
    await prisma.$executeRaw`UPDATE purchase_orders SET status = 'received', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "receive", new_values: { status: "received" } });
    return ok({ id: params.id, status: "received" });
  } catch (error) {
    return fail(400, { code: "RECEIVE_FAILED", message: errorMessage(error) });
  }
}
