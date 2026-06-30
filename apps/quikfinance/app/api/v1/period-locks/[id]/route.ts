import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

function canManageLocks(role: string) {
  return ["owner", "admin", "accountant"].includes(role);
}

/** Unlock a module — deactivates the lock so back-dated edits are allowed again. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  if (!canManageLocks(auth.context.role)) {
    return fail(403, { code: "INSUFFICIENT_ROLE", message: "Only admins and accountants can unlock periods." });
  }

  try {
    const { error } = await auth.context.db
      .from("period_locks")
      .update({ is_active: false })
      .eq("org_id", auth.context.orgId)
      .eq("id", params.id);
    if (error) return fail(400, { code: "UNLOCK_FAILED", message: error.message });

    await auth.context.db.from("audit_logs").insert({
      org_id: auth.context.orgId, user_id: auth.context.userId,
      entity_type: "period_lock", entity_id: params.id, action: "unlock", new_values: { is_active: false }
    });
    return ok({ id: params.id, status: "inactive" });
  } catch (error) {
    return fail(500, { code: "UNLOCK_FAILED", message: errorMessage(error) });
  }
}
