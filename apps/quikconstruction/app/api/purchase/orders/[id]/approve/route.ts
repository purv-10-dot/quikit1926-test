import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/context";
import { handleApprovalAction } from "@/lib/workflow/handle-approval";

/**
 * POST /api/purchase/orders/:id/approve — 2-stage PO approval
 *
 * Flow:
 *   pending_l1 → (L1) → pending_l2
 *   pending_l2 → (L2) → approved
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAnyPermission([
    "purchase.po.approve_l1",
    "purchase.po.approve_l2",
  ]);
  if (auth instanceof NextResponse) return auth;

  return handleApprovalAction(req, {
    prismaModel: "cnPurchaseOrder",
    entityId: params.id,
    entityType: "po",
    requiredPermission: "purchase.po.approve_l1",
    transitions: {
      approve: ["pending_approval", "submitted", "pending_l1", "pending_l2"],
      reject: ["pending_approval", "submitted", "pending_l1", "pending_l2"],
      return: ["pending_approval", "submitted", "pending_l1", "pending_l2"],
    },
    // L1 and L2 are still distinct steps so the role-based actor check
    // still works, but the entry state is `pending_approval` (matches
    // PR/Indent/RFQ). Legacy `pending_l1` / `pending_l2` records still
    // advance correctly through the same chain.
    nextStatusOnApprove: (current) => {
      if (current === "pending_approval" || current === "submitted") return "pending_l2";
      if (current === "pending_l1") return "pending_l2";
      if (current === "pending_l2") return "approved";
      return "approved";
    },
  });
}
