import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { canAccessEmployee } from "@/lib/rbac/hierarchy";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/** GET /api/v1/hrms/leaves/balances?employeeId=...&year=... */
export const GET = withServiceAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const { searchParams } = new URL(req.url);
    let employeeId = searchParams.get("employeeId");
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

    // Resolve auth userId to the caller's real Employee.id (exact match wins;
    // admin fallback is dev-only). Avoids mis-resolving the caller to the admin.
    const meId = await resolveEmployeeId(orgId, userId);

    if (employeeId === "me" || employeeId === userId || !employeeId) {
      employeeId = meId ?? employeeId;
    }

    // Hierarchy guard: a lower-priority caller cannot view a higher-priority employee's balance
    if (employeeId && employeeId !== meId) {
      const allowed = await canAccessEmployee(ctx, employeeId);
      if (!allowed) return forbidden("Cannot view balances of an employee above your role hierarchy");
    }

    const where = {
      orgId,
      year,
      deletedAt: null,
      ...(employeeId && { employeeId }),
    };

    const balances = await prisma.leaveBalance.findMany({
      where,
      include: {
        leaveType: { select: { id: true, name: true, code: true, color: true, isPaid: true, maxBalance: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { leaveType: { name: "asc" } },
    });

    // LeaveType.maxBalance is source-of-truth for opening.
    const enriched = balances.map((b) => {
      const opening = Number(b.leaveType.maxBalance);
      return {
        ...b,
        opening,
        available:
          opening + Number(b.accrued) + Number(b.adjusted) +
          Number(b.carriedForward) - Number(b.taken) - Number(b.encashed) - Number(b.lapsed),
      };
    });

    return successResponse(enriched);
  } catch (error) {
    console.error("GET /leaves/balances error:", error);
    return internalError();
  }
});
