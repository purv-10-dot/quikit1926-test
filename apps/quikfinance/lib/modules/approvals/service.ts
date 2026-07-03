import type { DbClient } from "@/lib/db";

export interface ApprovalCheck {
  required: boolean;
  policyId: string | null;
  policyName: string | null;
  approverRole: string | null;
}

/**
 * Checks whether a given entity+amount combination requires approval
 * based on active policies for the org.
 */
export async function checkApprovalRequired(
  db: DbClient,
  orgId: string,
  entityType: string,
  amount: number
): Promise<ApprovalCheck> {
  const { data: policies } = await db
    .from("approval_policies")
    .select("id, name, min_amount, max_amount, approver_role")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("is_active", true)
    .order("min_amount", { ascending: true });

  if (!policies || policies.length === 0) {
    return { required: false, policyId: null, policyName: null, approverRole: null };
  }

  for (const policy of policies) {
    const aboveMin = policy.min_amount == null || amount >= policy.min_amount;
    const belowMax = policy.max_amount == null || amount <= policy.max_amount;
    if (aboveMin && belowMax) {
      return {
        required: true,
        policyId: policy.id,
        policyName: policy.name,
        approverRole: policy.approver_role
      };
    }
  }

  return { required: false, policyId: null, policyName: null, approverRole: null };
}

/**
 * Creates an approval request and writes an audit log entry.
 * Returns the created request id.
 */
export async function createApprovalRequest(
  db: DbClient,
  orgId: string,
  requestedBy: string,
  entityType: string,
  entityId: string,
  policyId: string,
  notes?: string
): Promise<string> {
  const { data, error } = await db
    .from("approval_requests")
    .insert({
      org_id: orgId,
      policy_id: policyId,
      entity_type: entityType,
      entity_id: entityId,
      requested_by: requestedBy,
      status: "pending",
      notes: notes ?? null
    })
    .select("id")
    .single();

  if (error) throw error;

  await db.from("audit_log").insert({
    org_id: orgId,
    user_id: requestedBy,
    action: "approval_requested",
    entity_type: entityType,
    entity_id: entityId,
    meta: { approval_request_id: data.id, policy_id: policyId }
  });

  return data.id;
}

/**
 * Resolves a pending approval request (approve/reject/cancel).
 * Writes an audit log entry.
 */
export async function resolveApprovalRequest(
  db: DbClient,
  orgId: string,
  requestId: string,
  reviewedBy: string,
  action: "approve" | "reject" | "cancel",
  rejectionReason?: string
): Promise<void> {
  const statusMap = { approve: "approved", reject: "rejected", cancel: "cancelled" } as const;

  const { data: req, error: fetchError } = await db
    .from("approval_requests")
    .select("id, entity_type, entity_id, status")
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single();

  if (fetchError || !req) throw fetchError ?? new Error("Request not found");
  if (req.status !== "pending") throw new Error("Only pending requests can be reviewed");

  const { error } = await db
    .from("approval_requests")
    .update({
      status: statusMap[action],
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason ?? null
    })
    .eq("id", requestId);

  if (error) throw error;

  await db.from("audit_log").insert({
    org_id: orgId,
    user_id: reviewedBy,
    action: `approval_${statusMap[action]}`,
    entity_type: req.entity_type,
    entity_id: req.entity_id,
    meta: { approval_request_id: requestId, rejection_reason: rejectionReason }
  });
}
