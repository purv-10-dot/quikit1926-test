import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { accept: "accepted", reject: "rejected", partial: "partially_accepted" };

/** Vendor responds to a PO. Body: { action: accept|reject|partial }. Tenant + RBAC scoped. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await portalRoute("vendor", "accept_po");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return fail(403, { code: "NO_CONTACT", message: "No vendor account linked." });

  try {
    const { action } = (await request.json()) as { action?: string };
    const next = STATUS[action ?? ""];
    if (!next) return fail(422, { code: "BAD_ACTION", message: "action must be accept, reject or partial." });

    const rows = (await prisma.$queryRaw`
      UPDATE purchase_orders SET status = ${next}, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid
      RETURNING id, purchase_order_number, status
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "PO_ACTION_FAILED", message: errorMessage(error) });
  }
}
