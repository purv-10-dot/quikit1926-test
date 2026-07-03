import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId, userId, role } = auth.context;

  if (!["owner", "admin", "accountant"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "You do not have permission to review approvals." });
  }

  try {
    const body = await req.json();
    const action = body.action as "approve" | "reject" | "cancel";
    if (!["approve", "reject", "cancel"].includes(action)) {
      return fail(422, { code: "INVALID_ACTION", message: "Action must be approve, reject, or cancel." });
    }

    const { data: existing } = await db
      .from("approval_requests")
      .select("*")
      .eq("id", params.id)
      .eq("org_id", orgId)
      .single();

    if (!existing) return fail(404, { code: "NOT_FOUND", message: "Approval request not found." });
    if (existing.status !== "pending") {
      return fail(409, { code: "ALREADY_REVIEWED", message: "This request has already been reviewed." });
    }

    const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";

    const { data, error } = await db
      .from("approval_requests")
      .update({
        status: newStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: action === "reject" ? (body.reason ?? null) : null
      })
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;

    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action,
      entity_type: "approval_request",
      entity_id: params.id,
      new_values: { status: newStatus, reason: body.reason }
    });

    return ok(data);
  } catch (e) {
    return fail(500, { code: "UPDATE_ERROR", message: errorMessage(e) });
  }
}
