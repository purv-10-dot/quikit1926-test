import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { resolveActivePolicyRules, evaluateLeavePolicy } from "@/lib/services/leave-policy-engine";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/**
 * POST /api/v1/hrms/leaves/requests/dry-run
 *
 * Mirrors the policy resolution + evaluation that POST /leaves/requests does,
 * but never persists anything. Powers the Apply Leave modal's "live preview":
 * show applicable rules for the chosen leave type and surface violations
 * before the user hits Submit.
 *
 * - leaveTypeId is required; the rest is optional so the UI can fetch rules
 *   the moment a leave type is picked, before dates are set.
 * - When dates/duration are omitted, only the resolved rule card is returned
 *   (violations array stays empty).
 */
const bodySchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  duration: z.number().optional(),
  isPlanned: z.boolean().optional().default(true),
  hasAttachments: z.boolean().optional().default(false),
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: data.leaveTypeId, orgId, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    if (!leaveType) return validationError("Invalid leave type");

    // Resolve auth userId to the caller's real Employee.id (exact match wins;
    // admin fallback is dev-only) so the preview reflects the right person.
    const meId = await resolveEmployeeId(orgId, userId);
    const employee = meId
      ? await prisma.employee.findFirst({
          where: { orgId, deletedAt: null, id: meId },
          select: {
            id: true, gender: true, employmentType: true, workerType: true,
            dateOfJoining: true, departmentId: true,
            appRoles: { select: { roleId: true }, take: 1 },
          },
        })
      : null;
    if (!employee) return validationError("Employee record not found");
    const employeeRoleId = employee.appRoles[0]?.roleId ?? null;

    const employeeMeta = {
      gender: employee.gender,
      employmentType: employee.employmentType,
      workerType: employee.workerType,
      dateOfJoining: employee.dateOfJoining,
      departmentId: employee.departmentId,
      roleId: employeeRoleId,
    };

    const policyRules = await resolveActivePolicyRules({ orgId, employee: employeeMeta });

    // Find the rule object specifically for this leave-type code so the UI
    // can render a clean list of what applies. Falls back to {} if no rule
    // exists — the UI will say "No specific limits".
    const typeRule = policyRules?.leaveTypes.find((t) => t.leaveTypeCode === leaveType.code) ?? null;

    // No dates yet → only return the rules card, skip violation eval.
    if (!data.startDate || !data.endDate) {
      return successResponse({
        leaveType: { id: leaveType.id, code: leaveType.code, name: leaveType.name },
        rules: typeRule,
        violations: [],
        ok: true,
      });
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return validationError("Invalid date range");
    }
    const duration = data.duration
      ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

    if (!policyRules) {
      // No active policy → nothing to enforce.
      return successResponse({
        leaveType: { id: leaveType.id, code: leaveType.code, name: leaveType.name },
        rules: typeRule,
        violations: [],
        ok: true,
      });
    }

    const evaluation = await evaluateLeavePolicy({
      ctx: {
        orgId,
        employeeId: employee.id,
        startDate: start,
        endDate: end,
        duration,
        leaveTypeCode: leaveType.code,
        leaveTypeId: leaveType.id,
        isPlanned: data.isPlanned,
        hasAttachments: data.hasAttachments,
      },
      employee: employeeMeta,
      rules: policyRules,
    });

    return successResponse({
      leaveType: { id: leaveType.id, code: leaveType.code, name: leaveType.name },
      rules: typeRule,
      violations: evaluation.violations ?? [],
      ok: evaluation.ok,
    });
  } catch (error) {
    console.error("POST /leaves/requests/dry-run error:", error);
    return internalError();
  }
}, {
  // Cheap endpoint — cap so a runaway client typing-debounce can't hammer it.
  rateLimit: { max: 120, windowSec: 60, by: "user", scope: "leaves.dry-run" },
});
