import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, forbidden } from "@/lib/api-response";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import { invalidatePermissionCache } from "@/lib/with-auth";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { mirrorHrmsRolesToCentral } from "@/lib/rbac/mirrorRole";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { cascadeSoftDeleteEmployee, restoreEmployee } from "@/lib/services/employee-cascade";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { syncEmploymentHistory } from "@/lib/services/employment-history";
import { emitEmployeeIndex, emitEmployeeDeindex } from "@/lib/search/search-index";

/** GET /api/v1/hrms/employees/:id — full employee detail */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;

    // Access guard — a user may only open profiles within their scope:
    //   self  → only their own;  team → their direct reports;
    //   all   → role-hierarchy-limited (no same-level peers);  super_admin → any.
    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No access to employee profiles");
    const callerId = await resolveEmployeeId(orgId, ctx.userId);
    const allowed = sf.employeeIds === undefined || params.id === callerId || sf.employeeIds.includes(params.id);
    if (!allowed) return forbidden("You don't have access to this employee's profile");

    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, code: true } },
        team: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true, level: true } },
        grade: { select: { id: true, name: true, level: true } },
        officeLocation: { select: { id: true, name: true, city: true, country: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true, employeeCode: true },
        },
        dottedLineManager: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true },
        },
        directReports: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true, employeeCode: true },
        },
        appRoles: {
          take: 1,
          select: {
            roleId: true,
            role: { select: { id: true, name: true, description: true } },
          },
        },
      },
    });

    if (!employee) return notFound("Employee not found");

    // UI back-compat: surface primary role as `employee.role` and `employee.roleId`.
    const primary = employee.appRoles[0] ?? null;
    const { appRoles: _appRoles, ...rest } = employee;
    void _appRoles;
    const shaped = {
      ...rest,
      roleId: primary?.roleId ?? null,
      role: primary?.role
        ? { id: primary.role.id, code: primary.role.name, name: primary.role.name, description: primary.role.description }
        : null,
    };

    return successResponse(shaped);
  } catch (error) {
    console.error("GET /employees/:id error:", error);
    return internalError();
  }
});

/**
 * PATCH /api/v1/hrms/employees/:id — update employee.
 * Allowed when editing your OWN profile, OR when you hold `hrms.employee.write`
 * (super_admin has this via the "*" wildcard). HR/admins can edit anyone;
 * regular employees can only edit themselves.
 */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const currentEmployeeId = await resolveEmployeeId(orgId, userId);
    const isSelf = !!currentEmployeeId && currentEmployeeId === params.id;
    const canManageEmployees = permissions.includes("*") || permissions.includes("hrms.employee.write");
    // Role assignment is a distinct, higher privilege than editing employees.
    const canManageRoles = permissions.includes("*") || permissions.includes("hrms.rbac.manage");
    if (!isSelf && !canManageEmployees) {
      return forbidden("You don't have permission to edit this employee's profile.");
    }

    const existing = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Employee not found");

    const body = await req.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;

    const updateData: Record<string, unknown> = { updatedBy: userId };

    // Map fields, converting date strings
    const dateFields = ["dateOfBirth", "confirmationDate", "probationEndDate", "lastWorkingDate"] as const;
    const directFields = [
      "firstName", "middleName", "lastName", "displayName", "gender", "bloodGroup",
      "maritalStatus", "nationality", "profilePhoto", "coverImage", "bio", "personalEmail",
      "personalPhone", "workPhone", "linkedinUrl", "githubUrl", "portfolioUrl",
      "currentAddress", "permanentAddress", "emergencyContacts", "jobTitle",
      "departmentId", "teamId", "designationId", "gradeId", "reportingManagerId",
      "dottedLineManagerId", "employmentType", "workerType", "workLocation",
      "officeLocationId", "noticePeriodDays", "noticePeriodId", "previousExperience", "sourceOfHire",
      "referredById", "identityDocuments", "bankAccounts", "panNumber", "aadhaarNumber",
      "taxIdentificationNumber", "skills", "certifications", "languages", "educations",
      "pastExperiences", "customFields", "status",
      "isHandicapped", "isSeniorCitizen", "epfContributionRate",
      "epfApplicable", "esiApplicable", "ptApplicable",
    ] as const;
    // roleId is handled separately via UserAppRole join — not an Employee column.
    // Role changes require the dedicated rbac.manage privilege (NOT plain
    // employee.write); any other caller's roleId is ignored silently.
    const rawRoleId = "roleId" in data ? ((data as { roleId?: string | null }).roleId ?? null) : undefined;
    const incomingRoleId = canManageRoles ? rawRoleId : undefined;

    for (const field of directFields) {
      if (field in data) {
        updateData[field] = data[field as keyof typeof data];
      }
    }

    for (const field of dateFields) {
      if (field in data) {
        const val = data[field as keyof typeof data] as string | undefined;
        updateData[field] = val ? new Date(val) : null;
      }
    }

    // Privilege-escalation guard: a self-service editor (no employee.write) may
    // only change their own PERSONAL / contact fields — never org, compensation,
    // status, statutory, role, or identity-document data.
    if (isSelf && !canManageEmployees) {
      const SELF_EDITABLE = new Set([
        "firstName", "middleName", "lastName", "displayName", "gender", "bloodGroup",
        "maritalStatus", "nationality", "profilePhoto", "coverImage", "bio",
        "personalEmail", "personalPhone", "workPhone", "linkedinUrl", "githubUrl",
        "portfolioUrl", "currentAddress", "permanentAddress", "emergencyContacts",
        "dateOfBirth", "languages",
      ]);
      for (const key of Object.keys(updateData)) {
        if (key !== "updatedBy" && !SELF_EDITABLE.has(key)) delete updateData[key];
      }
    }

    // Role changes require rbac.manage (incomingRoleId is undefined otherwise).
    if (incomingRoleId !== undefined) {
      // Tier guard: can't assign a role carrying permissions you don't hold
      // (mirrors PUT /employees/:id/role). Only applies when setting a role.
      if (incomingRoleId) {
        const role = await prisma.hrmsAppRole.findFirst({
          where: { id: incomingRoleId, orgId, appId: APP_ID },
          select: { id: true, permissions: { select: { resource: true, action: true } } },
        });
        if (!role) return validationError("Role not found");
        if (!permissions.includes("*")) {
          const held = new Set(permissions);
          const missing = role.permissions.map((p) => joinCode(p.resource, p.action)).filter((c) => !held.has(c));
          if (missing.length) {
            return validationError(`You can't assign a role with permissions you don't hold: ${missing.join(", ")}`);
          }
        }
      }
      try {
        await ensureSuperAdminRemains(orgId, [params.id], incomingRoleId);
      } catch (e) {
        return validationError(e instanceof Error ? e.message : "Super admin guard failed");
      }
    }

    // Relational-id integrity — every supplied FK that will be persisted must
    // resolve inside the caller's org (mirrors the org-scoped salaryStructure
    // lookup in POST). Uses updateData so stripped self-service fields are skipped.
    {
      const relErrors: Record<string, string[]> = {};
      const notInOrg = (f: string) => { relErrors[f] = [`${f} does not belong to this organization`]; };
      const emp = async (f: string) => { const id = updateData[f] as string | undefined; if (id && !(await prisma.employee.findFirst({ where: { id, orgId, deletedAt: null }, select: { id: true } }))) notInOrg(f); };
      if (updateData.reportingManagerId) await emp("reportingManagerId");
      if (updateData.dottedLineManagerId) await emp("dottedLineManagerId");
      if (updateData.referredById) await emp("referredById");
      if (updateData.departmentId && !(await prisma.department.findFirst({ where: { id: updateData.departmentId as string, orgId }, select: { id: true } }))) notInOrg("departmentId");
      if (updateData.teamId && !(await prisma.team.findFirst({ where: { id: updateData.teamId as string, orgId }, select: { id: true } }))) notInOrg("teamId");
      if (updateData.designationId && !(await prisma.designation.findFirst({ where: { id: updateData.designationId as string, orgId }, select: { id: true } }))) notInOrg("designationId");
      if (updateData.gradeId && !(await prisma.grade.findFirst({ where: { id: updateData.gradeId as string, orgId }, select: { id: true } }))) notInOrg("gradeId");
      if (updateData.officeLocationId && !(await prisma.officeLocation.findFirst({ where: { id: updateData.officeLocationId as string, orgId }, select: { id: true } }))) notInOrg("officeLocationId");
      if (updateData.noticePeriodId && !(await prisma.noticePeriod.findFirst({ where: { id: updateData.noticePeriodId as string, orgId }, select: { id: true } }))) notInOrg("noticePeriodId");
      if (Object.keys(relErrors).length) return validationError("Validation failed", relErrors);
    }

    // Personal email uniqueness across other active employees in the tenant.
    if ("personalEmail" in updateData && updateData.personalEmail) {
      const dup = await prisma.employee.findFirst({
        where: {
          orgId,
          personalEmail: { equals: updateData.personalEmail as string, mode: "insensitive" },
          deletedAt: null,
          NOT: { id: params.id },
        },
        select: { id: true },
      });
      if (dup) {
        return validationError("Validation failed", { personalEmail: ["This personal email is already used by another employee"] });
      }
    }

    // EPF rate one-way guard: per EPF Act, once an employee opts for "Actual",
    // they cannot revert to "Restricted". Block the change here.
    if ("epfContributionRate" in updateData) {
      const currentRate = (existing as { epfContributionRate?: string | null }).epfContributionRate ?? null;
      const newRate = updateData.epfContributionRate as string | null;
      if (currentRate === "TwelvePercentActual" && newRate === "TwelvePercentRestricted") {
        return validationError(
          "EPF rate cannot revert from Actual to Restricted (per EPF Act). Raise an exception ticket if required.",
        );
      }
    }

    // Reporting-manager loop guard: an employee can't report to themselves or to
    // anyone in their own downline (would create a cycle in the org tree and can
    // hang code that walks the manager chain). Enforced server-side (the drag UI
    // guards it too, but the API must not depend on the client).
    if ("reportingManagerId" in updateData && updateData.reportingManagerId) {
      const newMgr = updateData.reportingManagerId as string;
      if (newMgr === params.id) {
        return validationError("An employee can't report to themselves.");
      }
      const everyone = await prisma.employee.findMany({
        where: { orgId, deletedAt: null },
        select: { id: true, reportingManagerId: true },
      });
      const childrenByMgr = new Map<string, string[]>();
      for (const e of everyone) {
        if (!e.reportingManagerId) continue;
        const arr = childrenByMgr.get(e.reportingManagerId) ?? [];
        arr.push(e.id);
        childrenByMgr.set(e.reportingManagerId, arr);
      }
      const downline = new Set<string>();
      const queue = [...(childrenByMgr.get(params.id) ?? [])];
      while (queue.length) {
        const id = queue.shift()!;
        if (downline.has(id)) continue;
        downline.add(id);
        for (const k of childrenByMgr.get(id) ?? []) queue.push(k);
      }
      if (downline.has(newMgr)) {
        return validationError("This would create a reporting loop — the chosen manager reports (directly or indirectly) to this employee.");
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: params.id },
        data: updateData,
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, title: true } },
        },
      });
      if (incomingRoleId !== undefined) {
        await tx.hrmsUserAppRole.deleteMany({
          where: { orgId: orgId, userId: params.id },
        });
        if (incomingRoleId) {
          await tx.hrmsUserAppRole.create({
            data: { orgId: orgId, userId: params.id, roleId: incomingRoleId, assignedBy: userId },
          });
        }
      }
      return updated;
    });

    const changedFields = Object.keys(updateData).filter((k) => k !== "updatedBy");
    if (incomingRoleId !== undefined) changedFields.push("roleId");

    if (incomingRoleId !== undefined) {
      // Keep the central UserAppAccess.role mirror (what the Admin Portal
      // shows) in sync with the role just assigned in QuikHrms.
      const assignedRole = incomingRoleId
        ? await prisma.hrmsAppRole.findFirst({
            where: { id: incomingRoleId, orgId },
            select: { name: true },
          })
        : null;
      await mirrorHrmsRolesToCentral(orgId, [params.id], assignedRole?.name);
      invalidatePermissionCache(orgId, params.id);
    }


    // Keep Employment History in sync — auto-record any tracked field that
    // changed (designation, department, manager, grade, location, type, status…).
    void syncEmploymentHistory(orgId, params.id, existing, updateData, userId);

    if (
      changedFields.includes("reportingManagerId") ||
      changedFields.includes("departmentId") ||
      changedFields.includes("status")
    ) {
      void scheduleOrgChartRebuild(orgId, "employee.updated", userId);
    }

    void fireWorkflow({
      orgId,
      event: "employee.updated",
      payload: {
        employeeId: employee.id,
        changedFields,
        employee: { id: employee.id, status: employee.status, departmentId: employee.departmentId },
      },
    });

    if ("status" in data && data.status && existing.status !== data.status) {
      void fireWorkflow({
        orgId,
        event: "employee.status.changed",
        payload: {
          employeeId: employee.id,
          from: existing.status,
          to: data.status,
        },
      });
    }

    // Search index (§S-3): re-index the updated employee (§13-safe projection).
    emitEmployeeIndex(orgId, params.id, "update");

    return successResponse(employee);
  } catch (error) {
    console.error("PATCH /employees/:id error:", error);
    return internalError();
  }
});

/**
 * DELETE /api/v1/hrms/employees/:id — soft delete (temp).
 * Cascades soft-delete to related records (salary, leaves, wfh, tasks, docs, etc).
 * Direct reports get reportingManagerId/dottedLineManagerId nulled.
 * Audit/financial records (payslip, attendance, expenses, loans, history) are kept.
 * Restore via POST /api/v1/hrms/employees/:id/restore.
 */
export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Employee not found");

    try {
      await ensureSuperAdminRemains(orgId, [params.id], null);
    } catch (e) {
      return validationError(e instanceof Error ? e.message : "Super admin guard failed");
    }

    const result = await cascadeSoftDeleteEmployee(orgId, params.id, userId);

    // Search index (§S-3): remove the soft-deleted employee from the index.
    emitEmployeeDeindex(orgId, params.id);

    void scheduleOrgChartRebuild(orgId, "employee.deleted", userId);

    void fireWorkflow({
      orgId,
      event: "employee.deleted",
      payload: { employeeId: params.id },
    });

    return successResponse({ deleted: true, cascade: result.tables });
  } catch (error) {
    console.error("DELETE /employees/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.delete"] });

