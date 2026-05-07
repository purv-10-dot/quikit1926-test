import { NextRequest } from "next/server";
import { handleApprovalAction } from "@/lib/workflow/handle-approval";

/**
 * POST /api/purchase/rfqs/:id/approve — single-step RFQ approval.
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 * Permission: purchase.rfq.approve (falls back to purchase.po.approve
 *             on older tenants that hadn't seeded the dedicated key)
 *
 * Flow: pending_approval → approved → sent (vendor release is a
 * separate action; approve just greenlights it).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleApprovalAction(req, {
    prismaModel: "cnRfq",
    entityId: params.id,
    entityType: "rfq",
    requiredPermission: "purchase.po.approve_l1",
    transitions: {
      approve: ["submitted", "pending_approval"],
      reject: ["submitted", "pending_approval"],
      return: ["submitted", "pending_approval"],
    },
    nextStatusOnApprove: () => "approved",
  });
}
