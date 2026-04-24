import { db } from "@/lib/db";

/**
 * Approval gate helper.
 *
 * Checks whether the given (docType, amount) requires approval under current
 * tenant rules, and whether a matching CnApprovalRequest exists in `approved`
 * state for this doc.
 *
 * Returns { allowed: true } if no rule matches OR a request is approved.
 * Returns { allowed: false, reason } otherwise; callers should respond 403.
 */
export async function checkApprovalGate(args: {
  tenantId: string;
  docType: "pr" | "po" | "rab" | "vendor_bill" | "payroll" | "other";
  docId: string;
  amount: number | null;
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const { tenantId, docType, docId, amount } = args;

  // Find any active rule for this docType where the amount meets the threshold
  const rules = await db.cnApprovalRule.findMany({
    where: { tenantId, docType, deletedAt: null, status: "active" },
    select: { id: true, minAmount: true, name: true },
  });
  const matching = rules.filter(r => {
    if (r.minAmount == null) return true; // always requires approval
    return amount != null && amount >= Number(r.minAmount);
  });
  if (matching.length === 0) return { allowed: true };

  // Require an approved request for this doc
  const approved = await db.cnApprovalRequest.findFirst({
    where: { tenantId, docType, docId, status: "approved" },
    select: { id: true },
  });
  if (approved) return { allowed: true };

  return {
    allowed: false,
    reason: `Approval required by rule(s): ${matching.map(r => r.name).join(", ")}`,
  };
}
