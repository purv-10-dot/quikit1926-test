import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * Reimbursement category catalog. Returns every active Reimbursement-type
 * SalaryComponent in the tenant — the employee's salary structure is NOT
 * consulted any more (the new reimbursement flow lets anyone claim against
 * any category; HR enforces policy by approving or partially-approving).
 *
 * `?type=FBP` filters to FBP components; `?type=Reimbursement` filters them out;
 * omit for both.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("type") as "FBP" | "Reimbursement" | null;

    const components = await prisma.salaryComponent.findMany({
      where: {
        orgId,
        deletedAt: null,
        isActive: true,
        type: "Reimbursement",
        ...(kind === "FBP" ? { isFBP: true } : {}),
        ...(kind === "Reimbursement" ? { isFBP: false } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        isFBP: true,
        maxAmount: true,           // surfaced for reference only — no longer enforced
        description: true,
        requireBillNumber: true,
        requireMerchantName: true,
        requireUploadDoc: true,
        claimInstructions: true,
      },
      orderBy: { name: "asc" },
    });

    return successResponse(components);
  } catch (e) {
    console.error("GET /payroll/my-claims/components error:", e);
    return internalError();
  }
});
