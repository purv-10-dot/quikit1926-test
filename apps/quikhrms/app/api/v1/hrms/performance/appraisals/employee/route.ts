import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const cycleId = searchParams.get("cycleId");
    const status = searchParams.get("status");

    const where = {
      orgId, deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(cycleId && { cycleId }),
      ...(status && { status: status as "Pending" | "InProgress" | "Submitted" | "Completed" }),
    };

    const [appraisals, total] = await Promise.all([
      prisma.employeeAppraisal.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
          cycle: { select: { id: true, name: true, type: true, status: true } },
        },
      }),
      prisma.employeeAppraisal.count({ where }),
    ]);
    return successResponse(appraisals, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /appraisals/employee error:", error); return internalError(); }
});
