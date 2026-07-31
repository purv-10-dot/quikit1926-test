import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError, forbidden } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * GET /api/v1/hrms/employees/:id/summary — compact, §13-SAFE employee summary
 * for AI prompt-context (P0-3).
 *
 * Returns ONLY the §13 "probably safe to expose" projection — never salary,
 * PAN, Aadhaar, bank, personal contact, address, DOB, or any other sensitive
 * field. This is a deliberate default-DENY allow-list: adding a field here is a
 * conscious §13 decision, not the default. Plus a deep-link `url`.
 *
 * Access guard is identical to the full detail route (self / team / all /
 * super_admin scope), so the summary can never widen what a caller may see.
 *
 * withServiceAuth: reachable by a normal user session AND by the AI Runtime
 * acting as an employee (P0-1) — in both cases scoped to that identity's access.
 */
export const GET = withServiceAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;

    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No access to employee profiles");
    const callerId = await resolveEmployeeId(orgId, ctx.userId);
    const allowed =
      sf.employeeIds === undefined || params.id === callerId || sf.employeeIds.includes(params.id);
    if (!allowed) return forbidden("You don't have access to this employee's profile");

    const e = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      // §13 allow-list ONLY. Do not add sensitive columns here.
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        workEmail: true,
        workPhone: true,
        jobTitle: true,
        employmentType: true,
        workLocation: true,
        status: true,
        dateOfJoining: true,
        reportingManagerId: true,
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        grade: { select: { id: true, name: true } },
      },
    });

    if (!e) return notFound("Employee not found");

    const base = appBaseUrl();
    const summary = {
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.displayName || [e.firstName, e.lastName].filter(Boolean).join(" "),
      workEmail: e.workEmail,
      workPhone: e.workPhone,
      jobTitle: e.jobTitle,
      department: e.department?.name ?? null,
      designation: e.designation?.title ?? null,
      team: e.team?.name ?? null,
      grade: e.grade?.name ?? null,
      reportingManagerId: e.reportingManagerId,
      dateOfJoining: e.dateOfJoining,
      employmentType: e.employmentType,
      workLocation: e.workLocation,
      status: e.status,
      url: `${base}/employees/${e.id}`,
    };

    return successResponse(summary);
  } catch (error) {
    console.error("GET /employees/:id/summary error:", error);
    return internalError();
  }
});
