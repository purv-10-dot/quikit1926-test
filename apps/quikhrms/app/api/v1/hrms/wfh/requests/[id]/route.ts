import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError, forbidden } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const wfh = await prisma.wfhRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } } },
        approvals: {
          orderBy: { level: "asc" },
          include: { approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true } } },
        },
      },
    });
    if (!wfh) return notFound("WFH request not found");
    return successResponse(wfh);
  } catch (e) {
    console.error("GET /wfh/requests/[id]", e);
    return internalError();
  }
});

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const wfh = await prisma.wfhRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!wfh) return notFound("WFH request not found");
    if (wfh.employeeId !== employeeId) return forbidden("Only the requester can cancel");
    if (wfh.status !== "Pending") return conflict(`Cannot cancel — already ${wfh.status}`);

    const body = await req.json().catch(() => ({}));
    const reason = body.reason ? String(body.reason).trim() : null;

    const updated = await prisma.wfhRequest.update({
      where: { id: wfh.id },
      data: { status: "Cancelled", cancelReason: reason, updatedBy: userId },
    });

    return successResponse(updated);
  } catch (e) {
    console.error("DELETE /wfh/requests/[id]", e);
    return internalError();
  }
});
