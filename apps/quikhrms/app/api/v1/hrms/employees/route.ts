import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import { APP_ID } from "@/lib/rbac/registry";
import { forbidden } from "@/lib/api-response";
import { sendMail } from "@/lib/services/mailer";
import { buildWelcomeEmail } from "@/lib/email-templates/welcome";
import { inviteSingleEmployee } from "@/lib/services/invitation";
import { scheduleOrgChartRebuild } from "@/lib/org-chart-rebuild";
import { allocateProRataLeaveBalances } from "@/lib/services/leave-allocation";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/employees — list with search, filter, pagination */
export const GET = withAuth(async (req: NextRequest, ctx) => {
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
    // Opt-in: further restrict to the caller's role-priority hierarchy.
    const accessible = searchParams.get("accessible") === "true";

    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No employee read permission");

    let scopeIds = scopeFilter.employeeIds ?? null;
    if (accessible) {
      const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
      scopeIds = intersectEmployeeIds(scopeIds ?? undefined, hierarchy) ?? null;
    }
    const { data, total } = await (async () => {
      const where: Prisma.EmployeeWhereInput = {
        orgId,
        ...(onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null }),
        ...(scopeIds && { id: { in: scopeIds } }),
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
        ...(status && { status: status as Prisma.EmployeeWhereInput["status"] }),
        ...(employmentType && { employmentType: employmentType as Prisma.EmployeeWhereInput["employmentType"] }),
        ...(workLocation && { workLocation: workLocation as Prisma.EmployeeWhereInput["workLocation"] }),
        ...(officeLocationId && { officeLocationId }),
      };

      const orderBy: Prisma.EmployeeOrderByWithRelationInput = sort
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
      };

      const [employees, total] = await Promise.all([
        prisma.employee.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
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
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;

    // Duplicate work email is allowed by policy (DB unique constraint dropped).
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

    // RBAC v2: link to AppRole via UserAppRole join. If no roleId provided,
    // fall back to the tenant's default role (AppRole.isDefault = true).
    let assignedRoleId: string | null = data.roleId ?? null;
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

    // Salary assignment — required on create.
    const structure = await prisma.salaryStructure.findFirst({
      where: { id: data.salaryTemplateId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!structure) {
      return validationError("Salary template not found");
    }
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

    void (async () => {
      try {
        if (!employee.workEmail) return;

        // If HR chose to invite (popup on the Add form), send the account-setup
        // invite instead of the welcome email: creates a Pending Invitation linked
        // to this employee and queues the activation email so they set a password.
        if (data.sendInvite) {
          // Single employee → send the invite directly via SMTP (no BullMQ).
          await inviteSingleEmployee(orgId, userId, {
            id: employee.id,
            workEmail: employee.workEmail,
            firstName: employee.firstName,
            lastName: employee.lastName,
            roleId: assignedRoleId,
          });
          return;
        }

        const [company, manager] = await Promise.all([
          prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
          employee.reportingManagerId
            ? prisma.employee.findUnique({
                where: { id: employee.reportingManagerId },
                select: { firstName: true, lastName: true },
              })
            : Promise.resolve(null),
        ]);

        const { subject, html } = buildWelcomeEmail({
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeCode: employee.employeeCode,
          jobTitle: employee.jobTitle,
          department: employee.department?.name ?? null,
          dateOfJoining: new Date(employee.dateOfJoining).toLocaleDateString("en-IN", {
            day: "2-digit", month: "long", year: "numeric",
          }),
          managerName: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
          companyName: company?.companyName ?? "QuikIT HRMS",
          portalUrl: process.env.APP_URL,
        });
        // Single employee → send the welcome email directly via SMTP (no BullMQ).
        await sendMail({ to: employee.workEmail, subject, html });
      } catch (err) {
        console.error("[mail] welcome email failed:", err);
      }
    })();

    return successResponse(employee, undefined, 201);
  } catch (error) {
    console.error("POST /employees error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
