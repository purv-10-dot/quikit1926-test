import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

/** Update an audit item's status. Body: { status: open|received|closed } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await portalRoute("ca", "audit");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context;
  try {
    const { status } = (await request.json()) as { status?: string };
    if (!status || !["open", "received", "closed"].includes(status)) return fail(422, { code: "BAD_STATUS", message: "Invalid status." });
    const rows = (await prisma.$queryRaw`
      UPDATE ca_audit_items SET status = ${status}, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid RETURNING id, status`) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Item not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "AUDIT_UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await portalRoute("ca", "audit");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context;
  try {
    await prisma.$executeRaw`DELETE FROM ca_audit_items WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ deleted: true });
  } catch (error) {
    return fail(400, { code: "AUDIT_DELETE_FAILED", message: errorMessage(error) });
  }
}
