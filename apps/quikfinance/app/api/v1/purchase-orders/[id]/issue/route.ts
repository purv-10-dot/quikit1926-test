import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Mark a purchase order as issued (Zoho: Draft → Issued). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const count = (await prisma.$executeRaw`UPDATE purchase_orders SET status = 'issued', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND status = 'draft'`) as number;
    if (!count) return fail(409, { code: "INVALID_STATE", message: "Only a draft purchase order can be marked as issued." });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "issue", new_values: { status: "issued" } });
    return ok({ id: params.id, status: "issued" });
  } catch (error) {
    return fail(400, { code: "ISSUE_FAILED", message: errorMessage(error) });
  }
}
