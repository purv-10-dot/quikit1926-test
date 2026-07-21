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

    // Per-type opening from the employee's active Leave Group (group rules win
    // over LeaveType.maxBalance) — keeps the cards consistent with enforcement.
    let ruleOpening: Map<string, number> | null = null;
    if (employeeId) {
      const emp = await prisma.employee.findFirst({
        where: { orgId, id: employeeId },
        select: { appRoles: { select: { roleId: true }, take: 1 } },
      });
      const roleId = emp?.appRoles[0]?.roleId ?? null;
      const assignments = await prisma.leaveGroupAssignment.findMany({
        where: {
          orgId,
          leaveGroup: { deletedAt: null, isActive: true },
          OR: [{ employeeId }, ...(roleId ? [{ roleId }] : [])],
        },
        select: { employeeId: true, leaveGroupId: true },
      });
      const chosen = assignments.find((a) => a.employeeId === employeeId) ?? assignments[0];
      if (chosen) {
        const items = await prisma.leaveGroupItem.findMany({
          where: { orgId, leaveGroupId: chosen.leaveGroupId },
          select: { leaveTypeId: true, rules: true },
        });
        ruleOpening = new Map();
        for (const it of items) {
          const r = it.rules as { isUnlimited?: boolean; maxBalance?: number } | null;
          // Unlimited types have no fixed quota — leave them to the default path.
          if (r && typeof r === "object" && r.isUnlimited) continue;
          // Every other group-item type is governed by the group: use its
          // configured quota, or 0 when none has been set yet (never the stale
          // accrued balance).
          const q = r && typeof r === "object" && typeof r.maxBalance === "number" ? Number(r.maxBalance) : 0;
          ruleOpening.set(it.leaveTypeId, q);
        }
      }
    }

    // Opening = group-rule entitlement when set, else LeaveType.maxBalance.
    const enriched = balances.map((b) => {
      const ruled = ruleOpening?.has(b.leaveTypeId) ?? false;
      const opening = ruled ? ruleOpening!.get(b.leaveTypeId)! : Number(b.leaveType.maxBalance);
      // For a group-ruled type the rule IS the full annual entitlement — the
      // legacy accrued balance is ignored (else the rule stacks on top of it).
      const accrued = ruled ? 0 : Number(b.accrued);
      return {
        ...b,
        opening,
        accrued: String(accrued),
        available:
          opening + accrued + Number(b.adjusted) +
          Number(b.carriedForward) - Number(b.taken) - Number(b.encashed) - Number(b.lapsed),
      };
    });

    return successResponse(enriched);
  } catch (error) {
    console.error("GET /leaves/balances error:", error);
    return internalError();
  }
});
