import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { forbidden } from "@/lib/api-response";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { allocateProRataLeaveBalances } from "@/lib/services/leave-allocation";
import { emitEmployeeIndex } from "@/lib/search/search-index";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/employees — list with search, filter, pagination */
export const GET = withServiceAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);

    const search = searchParams.get("search");
    // Accept both `department` (legacy) and `departmentId` (matches every
    // other endpoint's naming) so callers don't silently break.
    const department = searchParams.get("department") ?? searchParams.get("departmentId");
    const designationId = searchParams.get("designationId");
    const status = searchParams.get("status");
    const employmentType = searchParams.get("employmentType");
    const workLocation = searchParams.get("workLocation");
    const officeLocationId = searchParams.get("officeLocationId");
    const fields = searchParams.get("fields")?.split(",").filter(Boolean) ?? [];
    const includeDeleted = searchParams.get("includeDeleted") === "1";
    const onlyDeleted = searchParams.get("onlyDeleted") === "1";
    // Opt-in: only employees who actually have a login account — either linked to
    // central SSO (authUserId set) or provisioned a native password (passwordHash
    // set). Used by the Users & Invitations screen so it lists real users, not
    // every employee record.
    const provisioned = searchParams.get("provisioned") === "true";
    // Opt-in: only employees who can still be invited — no login account yet
    // (no authUserId, no passwordHash) AND no Pending invitation. Powers the
    // "Not yet invited" list on the Users & Invitations screen.
    const invitable = searchParams.get("invitable") === "true";
    // Opt-in: further restrict to the caller's role-priority hierarchy.
    const accessible = searchParams.get("accessible") === "true";
    // Opt-in: lightweight "pick a person" mode (interviewer, approver,
    // assignee, reporting manager, recipient, etc.) — returns every active
    // employee org-wide, bypassing the caller's own self/team/all employee-read
    // scope below. Choosing someone's name for an assignment isn't the same as
    // browsing/managing their full profile, so this intentionally matches the
    // policy the Org Chart/Directory already uses (name+role visible to any
    // authenticated employee, no permission gate).
    const picker = searchParams.get("picker") === "1";

    let scopeIds: string[] | null = null;
    if (!picker) {
      const scope = resolveScope(ctx, {
        all: "hrms.employee.read",
        team: "hrms.employee.read_team",
        self: "hrms.employee.read_self",
      });
      const scopeFilter = await employeeScopeFilter(ctx, scope);
      if (!scopeFilter.allow) return forbidden("No employee read permission");
      scopeIds = scopeFilter.employeeIds ?? null;
    }
    if (accessible) {
      const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
      scopeIds = intersectEmployeeIds(scopeIds ?? undefined, hierarchy) ?? null;
    }
    // For the "invitable" list we exclude anyone with a Pending invitation.
    const pendingInviteEmails = invitable
      ? (await prisma.invitation.findMany({
          where: { orgId, status: "Pending", deletedAt: null },
          select: { email: true },
        })).map((i) => i.email.toLowerCase())
      : [];

    const { data, total } = await (async () => {
      const where: Prisma.EmployeeWhereInput = {
        orgId,
        ...(onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null }),
        ...(scopeIds && { id: { in: scopeIds } }),
        // AND (not OR) so this doesn't collide with the `search` OR below.
        ...(provisioned && {
          AND: [{ OR: [{ authUserId: { not: null } }, { passwordHash: { not: null } }] }],
        }),
        // Invitable = no login account yet AND has a work email AND not already
        // sitting in a Pending invitation.
        ...(invitable && {
          authUserId: null,
          passwordHash: null,
          workEmail: { notIn: pendingInviteEmails },
        }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { workEmail: { contains: search, mode: "insensitive" } },
            { employeeCode: { contains: search, mode: "insensitive" } },
            { jobTitle: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(department && { departmentId: department }),
        ...(designationId && { designationId }),
        // "PreBoarding" employees are hidden from the directory by default —
        // they're only real/visible once HR clicks "Confirm Employee" at the
        // end of the Onboarding checklist (status flips to "Active"). An
        // explicit ?status= still works (e.g. a future "who's mid-onboarding" view).
        ...(status ? { status: status as Prisma.EmployeeWhereInput["status"] } : { status: { not: "PreBoarding" } }),
        ...(employmentType && { employmentType: employmentType as Prisma.EmployeeWhereInput["employmentType"] }),
        ...(workLocation && { workLocation: workLocation as Prisma.EmployeeWhereInput["workLocation"] }),
        ...(officeLocationId && { officeLocationId }),
      };

      // Only allow sorting by known Employee columns — never pass an arbitrary
      // client key straight to Prisma orderBy. Unknown/absent → newest first.
      const SORTABLE = new Set(["firstName", "lastName", "employeeCode", "dateOfJoining", "createdAt", "status"]);
      const orderBy: Prisma.EmployeeOrderByWithRelationInput = sort && SORTABLE.has(sort)
        ? { [sort]: order }
        : { createdAt: "desc" };

      const select: Prisma.EmployeeSelect = {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        workEmail: true,
        jobTitle: true,
        profilePhoto: true,
        status: true,
        employmentType: true,
        workLocation: true,
        dateOfJoining: true,
        gender: true,
        reportingManagerId: true,
        wfhQuotaGroupId: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        officeLocation: { select: { id: true, name: true, city: true } },
        appRoles: {
          select: { roleId: true, role: { select: { name: true } } },
          take: 1,
        },
        ...(fields.includes("manager") && {
          reportingManager: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        }),
        ...(fields.includes("team") && {
          team: { select: { id: true, name: true } },
        }),
        // `fields=full` — the complete, export-grade field set. Opt-in only
        // (used by CSV export) so normal directory paging stays lean. Covers
        // every scalar/JSON field captured on the employee form so a download
        // contains all the input data, not a subset.
        ...(fields.includes("full") && {
          middleName: true,
          dateOfBirth: true,
          bloodGroup: true,
          maritalStatus: true,
          nationality: true,
          isHandicapped: true,
          isSeniorCitizen: true,
          personalEmail: true,
          personalPhone: true,
          workPhone: true,
          linkedinUrl: true,
          githubUrl: true,
          portfolioUrl: true,
          currentAddress: true,
          permanentAddress: true,
          emergencyContacts: true,
          workerType: true,
          confirmationDate: true,
          probationEndDate: true,
          noticePeriodDays: true,
          tentativeJoiningDate: true,
          lastWorkingDate: true,
          previousExperience: true,
          sourceOfHire: true,
          currentSalary: true,
          expectedSalary: true,
          offerLetterUrl: true,
          highestQualification: true,
          skillSet: true,
          additionalInfo: true,
          panNumber: true,
          aadhaarNumber: true,
          taxIdentificationNumber: true,
          uanNumber: true,
          pfAccountNumber: true,
          esiNumber: true,
          epfApplicable: true,
          esiApplicable: true,
          ptApplicable: true,
          skills: true,
          certifications: true,
          languages: true,
          educations: true,
          pastExperiences: true,
          customFields: true,
          reportingManager: { select: { id: true, firstName: true, lastName: true } },
          team: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
        }),
      };

      // The shared pagination helper caps `limit` at 100 — correct for real
      // list pages, but a "pick a person" dropdown needs the WHOLE org in one
      // shot (an org with 191+ employees would otherwise silently lose
      // everyone past the 100th, alphabetically — no error, just missing
      // names). picker mode uses its own much higher ceiling instead.
      const pickerTake = picker ? Math.min(2000, Math.max(limit, parseInt(searchParams.get("limit") ?? "500", 10) || 500)) : limit;

      const [employees, total] = await Promise.all([
        prisma.employee.findMany({
          where,
          orderBy,
          skip: picker ? 0 : (page - 1) * limit,
          take: pickerTake,
          select,
        }),
        prisma.employee.count({ where }),
      ]);
      const mapped = employees.map((e) => {
        const { appRoles, ...rest } = e as typeof e & { appRoles?: { roleId: string; role: { name: string } }[] };
        const first = appRoles?.[0];
        return {
          ...rest,
          roleId: first?.roleId ?? null,
          role: first ? { code: first.role.name, name: first.role.name } : null,
        };
      });
      return { data: mapped, total };
    })();

    return successResponse(data, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /employees error:", error);
    return internalError();
  }
});

/** POST /api/v1/hrms/employees — create employee */
export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const body = await req.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten());
    }

    const data = parsed.data;

    // Work email must be unique across active employees — duplicate work
    // emails caused two Employee rows to fight over the same central
    // authUserId link (unique on orgId+authUserId), throwing at reconcile
    // time instead of at creation time.
    {
      const dupWorkEmail = await prisma.employee.findFirst({
        where: { orgId, workEmail: { equals: data.workEmail, mode: "insensitive" }, deletedAt: null },
        select: { id: true },
      });
      if (dupWorkEmail) {
        return validationError("Validation failed", { workEmail: ["This work email is already used by another employee"] });
      }
    }

    // Personal email must be unique across active employees.
    if (data.personalEmail) {
      const dup = await prisma.employee.findFirst({
        where: { orgId, personalEmail: { equals: data.personalEmail, mode: "insensitive" }, deletedAt: null },
        select: { id: true },
      });
      if (dup) {
        return validationError("Validation failed", { personalEmail: ["This personal email is already used by another employee"] });
      }
    }

    // Salary template is optional on create (HR can add an employee before any
    // template exists and assign salary later via Payroll → Employee Salaries).
    // When one IS supplied, validate it BEFORE any writes — otherwise an invalid
    // template returns a 400 *after* the employee + role rows are created,
    // orphaning a half-provisioned employee in the tenant.
    const structure = data.salaryTemplateId
      ? await prisma.salaryStructure.findFirst({
          where: { id: data.salaryTemplateId, orgId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (data.salaryTemplateId && !structure) {
      return validationError("Salary template not found");
    }

    // Relational-id integrity — every supplied FK must resolve inside the
    // caller's org (mirrors the org-scoped salaryStructure lookup above). Done
    // BEFORE any writes so a bad id can't orphan a half-provisioned employee.
    {
      const relErrors: Record<string, string[]> = {};
      const notInOrg = (f: string) => { relErrors[f] = [`${f} does not belong to this organization`]; };
      if (data.reportingManagerId && !(await prisma.employee.findFirst({ where: { id: data.reportingManagerId, orgId, deletedAt: null }, select: { id: true } }))) notInOrg("reportingManagerId");
      if (data.dottedLineManagerId && !(await prisma.employee.findFirst({ where: { id: data.dottedLineManagerId, orgId, deletedAt: null }, select: { id: true } }))) notInOrg("dottedLineManagerId");
      if (data.referredById && !(await prisma.employee.findFirst({ where: { id: data.referredById, orgId, deletedAt: null }, select: { id: true } }))) notInOrg("referredById");
      if (data.departmentId && !(await prisma.department.findFirst({ where: { id: data.departmentId, orgId }, select: { id: true } }))) notInOrg("departmentId");
      if (data.teamId && !(await prisma.team.findFirst({ where: { id: data.teamId, orgId }, select: { id: true } }))) notInOrg("teamId");
      if (data.designationId && !(await prisma.designation.findFirst({ where: { id: data.designationId, orgId }, select: { id: true } }))) notInOrg("designationId");
      if (data.gradeId && !(await prisma.grade.findFirst({ where: { id: data.gradeId, orgId }, select: { id: true } }))) notInOrg("gradeId");
      if (data.officeLocationId && !(await prisma.officeLocation.findFirst({ where: { id: data.officeLocationId, orgId }, select: { id: true } }))) notInOrg("officeLocationId");
      if (data.noticePeriodId && !(await prisma.noticePeriod.findFirst({ where: { id: data.noticePeriodId, orgId }, select: { id: true } }))) notInOrg("noticePeriodId");
      if (Object.keys(relErrors).length) return validationError("Validation failed", relErrors);
    }

    // Role assignment is privileged: only rbac.manage (or super admin) may set an
    // explicit roleId — any other caller's roleId is ignored silently (the tenant
    // default role is used). A permitted assigner still can't grant a role that
    // carries permissions they don't already hold (tier guard, mirrors
    // PUT /employees/:id/role). Validated before writes.
    const canManageRoles = permissions.includes("*") || permissions.includes("hrms.rbac.manage");
    const requestedRoleId: string | null = canManageRoles ? (data.roleId ?? null) : null;
    if (requestedRoleId) {
      const role = await prisma.hrmsAppRole.findFirst({
        where: { id: requestedRoleId, orgId, appId: APP_ID },
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

    const employeeCode = await generateEmployeeCode(orgId);

    const employee = await prisma.employee.create({
      data: {
        orgId,
        employeeCode,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        displayName: data.displayName ?? `${data.firstName} ${data.lastName}`,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        bloodGroup: data.bloodGroup,
        maritalStatus: data.maritalStatus,
        nationality: data.nationality,
        isHandicapped: data.isHandicapped ?? false,
        isSeniorCitizen: data.isSeniorCitizen ?? false,
        epfContributionRate: data.epfContributionRate ?? null,
        profilePhoto: data.profilePhoto,
        bio: data.bio,
        personalEmail: data.personalEmail,
        workEmail: data.workEmail,
        personalPhone: data.personalPhone,
        workPhone: data.workPhone,
        linkedinUrl: data.linkedinUrl,
        githubUrl: data.githubUrl,
        portfolioUrl: data.portfolioUrl,
        currentAddress: data.currentAddress ?? undefined,
        permanentAddress: data.permanentAddress ?? undefined,
        emergencyContacts: data.emergencyContacts ?? undefined,
        jobTitle: data.jobTitle,
        departmentId: data.departmentId,
        teamId: data.teamId,
        designationId: data.designationId,
        gradeId: data.gradeId,
        reportingManagerId: data.reportingManagerId,
        dottedLineManagerId: data.dottedLineManagerId,
        employmentType: data.employmentType,
        workerType: data.workerType,
        workLocation: data.workLocation,
        officeLocationId: data.officeLocationId,
        dateOfJoining: new Date(data.dateOfJoining),
        confirmationDate: data.confirmationDate ? new Date(data.confirmationDate) : undefined,
        probationEndDate: data.probationEndDate ? new Date(data.probationEndDate) : undefined,
        noticePeriodDays: data.noticePeriodDays,
        noticePeriodId: data.noticePeriodId ?? null,
        previousExperience: data.previousExperience,
        sourceOfHire: data.sourceOfHire,
        referredById: data.referredById,
        identityDocuments: data.identityDocuments ?? undefined,
        bankAccounts: data.bankAccounts ?? undefined,
        panNumber: data.panNumber,
        aadhaarNumber: data.aadhaarNumber,
        taxIdentificationNumber: data.taxIdentificationNumber,
        skills: data.skills ?? undefined,
        certifications: data.certifications ?? undefined,
        languages: data.languages ?? undefined,
        educations: data.educations ?? undefined,
        pastExperiences: data.pastExperiences ?? undefined,
        customFields: data.customFields ? JSON.parse(JSON.stringify(data.customFields)) : undefined,
        status: data.status,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    });

    // RBAC v2: link to AppRole via UserAppRole join. If no (permitted) roleId was
    // supplied, fall back to the tenant's default role (AppRole.isDefault = true).
    let assignedRoleId: string | null = requestedRoleId;
    if (!assignedRoleId) {
      const defaultRole = await prisma.hrmsAppRole.findFirst({
        where: { orgId: orgId, appId: APP_ID, isDefault: true },
        select: { id: true },
      });
      assignedRoleId = defaultRole?.id ?? null;
    }
    if (assignedRoleId) {
      await prisma.hrmsUserAppRole.create({
        data: { orgId: orgId, userId: employee.id, roleId: assignedRoleId, assignedBy: userId },
      });
    }

    // Salary assignment — optional on create. Skipped when no template was
    // picked (e.g. org has none yet); HR assigns it later via Payroll →
    // Employee Salaries, same as the recruit-onboarding and bulk-import paths.
    if (structure && data.ctcLpa != null) {
      await prisma.employeeSalary.create({
        data: {
          orgId,
          employeeId: employee.id,
          structureId: structure.id,
          ctc: data.ctcLpa * 100000,
          effectiveFrom: new Date(data.dateOfJoining),
          isActive: true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    try {
      await allocateProRataLeaveBalances({
        orgId, userId,
        employeeId: employee.id,
        dateOfJoining: new Date(data.dateOfJoining),
      });
    } catch (err) {
      console.error("[employees.create] pro-rata leave allocation failed:", err);
    }

    void scheduleOrgChartRebuild(orgId, "employee.created", userId);

    void fireWorkflow({
      orgId,
      event: "employee.created",
      payload: {
        employeeId: employee.id,
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          workEmail: employee.workEmail,
          status: employee.status,
        },
        status: employee.status,
        departmentId: employee.departmentId,
      },
    });

    // Search index (§S-3): add the new employee to the locator index (§13-safe).
    emitEmployeeIndex(orgId, employee.id, "create");

    // No invite / welcome email is sent on create. Invitations are triggered
    // manually from the Users & Invitations screen (the new employee appears
    // there under "Not yet invited").

    return successResponse(employee, undefined, 201);
  } catch (error) {
    console.error("POST /employees error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
