import { NextRequest } from "next/server";
import { handleApprovalAction } from "@/lib/workflow/handle-approval";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleApprovalAction(req, {
    prismaModel: "cnStockReconciliation",
    entityId: params.id,
    entityType: "recon",
    requiredPermission: "store.recon.approve",
    transitions: {
      approve: ["submitted", "pending_approval", "draft"],
      reject: ["submitted", "pending_approval", "draft"],
      return: ["submitted", "pending_approval", "draft"],
    },
  });
}
