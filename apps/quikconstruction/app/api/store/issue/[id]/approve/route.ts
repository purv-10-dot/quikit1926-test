import { NextRequest } from "next/server";
import { handleApprovalAction } from "@/lib/workflow/handle-approval";
import { postMaterialIssueOutward } from "@/lib/stock/ledger-service";

/**
 * POST /api/store/issue/:id/approve — Material Issue approval.
 *
 * Approving a Material Issue is the ONLY event that deducts stock from
 * `stock_balances` for consumption. The outward posting runs inside
 * the same DB transaction as the status flip via `onApproved`, so a
 * negative-balance failure rolls back both the posting and the status
 * change atomically.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleApprovalAction(req, {
    prismaModel: "cnMaterialIssue",
    entityId: params.id,
    entityType: "issue",
    requiredPermission: "store.issue.approve",
    transitions: {
      approve: ["submitted", "pending_approval", "draft"],
      reject: ["submitted", "pending_approval", "draft"],
      return: ["submitted", "pending_approval", "draft"],
    },
    // Load lines so the ledger posting has issuedQty + unitRate per row
    include: { lines: true },
    onApproved: async (issue, tx, ctx) => {
      if (!issue.locationId) {
        const e: any = new Error(
          "Cannot approve issue: no location assigned. Edit the issue and pick a store location first.",
        );
        e.code = "MISSING_LOCATION";
        e.httpStatus = 400;
        throw e;
      }
      if (!Array.isArray(issue.lines) || issue.lines.length === 0) {
        const e: any = new Error("Cannot approve issue: no line items.");
        e.code = "NO_LINES";
        e.httpStatus = 400;
        throw e;
      }
      await postMaterialIssueOutward(tx, ctx, {
        id: issue.id,
        issueNumber: issue.issueNumber,
        projectId: issue.projectId,
        locationId: issue.locationId,
        lines: issue.lines.map((l: any) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          issuedQty: Number(l.issuedQty?.toString?.() ?? l.issuedQty ?? 0),
          unitRate: Number(l.unitRate?.toString?.() ?? l.unitRate ?? 0),
        })),
      });
    },
  });
}
