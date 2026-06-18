import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const employeeId = searchParams.get("employeeId");
    const companyOnly = searchParams.get("companyOnly") === "true";

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const docs = await prisma.document.findMany({
      where: {
        orgId,
        deletedAt: null,
        expiryDate: { gte: now, lte: cutoff },
        status: { in: ["Active", "Draft"] },
        ...(companyOnly ? { employeeId: null } : employeeId ? { employeeId } : {}),
      },
      orderBy: { expiryDate: "asc" },
    });

    const withDays = docs.map((d) => ({
      ...d,
      daysUntilExpiry: d.expiryDate ? Math.ceil((d.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
    }));

    return successResponse(withDays);
  } catch (error) {
    console.error("GET /documents/expiring error:", error);
    return internalError();
  }
});
