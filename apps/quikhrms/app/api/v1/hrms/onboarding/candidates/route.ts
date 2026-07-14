import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";

const educationSchema = z.object({
  schoolName: z.string().optional(),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  completionDate: z.string().optional(),
  notes: z.string().optional(),
});

const experienceSchema = z.object({
  occupation: z.string().optional(),
  company: z.string().optional(),
  summary: z.string().optional(),
  duration: z.string().optional(),
  currentlyWorkHere: z.boolean().optional(),
});

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
});

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
});

const familyMemberSchema = z.object({
  name: z.string().min(1),
  relation: z.string().min(1),
  dob: z.string().optional(),
  occupation: z.string().optional(),
});

const certificationSchema = z.object({
  name: z.string().min(1),
  courseName: z.string().optional(),
  issuingAuthority: z.string().optional(),
  year: z.string().optional(),
  expiryDate: z.string().optional(),
  credentialUrl: z.string().optional(),
});

const addCandidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  workEmail: z.string().email(),
  personalEmail: z.string().email().optional().nullable(),
  personalPhone: z.string().optional().nullable(),
  profilePhoto: z.string().url().optional().nullable(),

  panNumber: z.string().optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),

  currentAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  sameAsPresent: z.boolean().optional(),

  previousExperience: z.number().int().min(0).optional(),
  sourceOfHire: z.enum(["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"]).optional().nullable(),
  skillSet: z.string().optional(),
  highestQualification: z.string().optional(),
  additionalInfo: z.string().optional(),

  officeLocationId: z.string().optional().nullable(),
  jobTitle: z.string().optional(),
  designationId: z.string().optional().nullable(),
  currentSalary: z.number().min(0).optional().nullable(),
  departmentId: z.string().optional().nullable(),
  reportingManagerId: z.string().min(1, "Reporting manager required"),
  roleId: z.string().min(1, "Role required"),

  salaryTemplateId: z.string().min(1, "Salary template required"),
  ctcLpa: z.number().positive("CTC (LPA) required"),
  offerLetterUrl: z.string().optional().nullable(),
  tentativeJoiningDate: z.string().optional().nullable(),
  dateOfJoining: z.string().optional().nullable(),

  educations: z.array(educationSchema).optional(),
  pastExperiences: z.array(experienceSchema).optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  familyMembers: z.array(familyMemberSchema).optional(),
  certifications: z.array(certificationSchema).optional(),

  templateId: z.string().optional().nullable(),
  saveDraft: z.boolean().optional(),
});

type TaskTpl = {
  title: string; description?: string; assigneeRole: string;
  dueInDays: number; category: string; isMandatory: boolean; sortOrder: number;
};

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const status = searchParams.get("status");

    const where = {
      orgId,
      deletedAt: null,
      status: "PreBoarding" as const,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { workEmail: { contains: search, mode: "insensitive" as const } },
          { personalEmail: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, title: true } },
          officeLocation: { select: { id: true, name: true } },
          reportingManager: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    const employeeIds = employees.map((e) => e.id);
    const [instances, salaries] = await Promise.all([
      prisma.onboardingInstance.findMany({
        where: { orgId, employeeId: { in: employeeIds }, deletedAt: null },
        select: { id: true, employeeId: true, status: true, startDate: true },
      }),
      prisma.employeeSalary.findMany({
        where: { orgId, employeeId: { in: employeeIds }, isActive: true, deletedAt: null },
        select: { employeeId: true, ctc: true },
      }),
    ]);

    const instanceMap = new Map(instances.map((i) => [i.employeeId, i]));
    const salaryMap = new Map(salaries.map((s) => [s.employeeId, s]));

    const candidates = employees
      .map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        firstName: e.firstName,
        lastName: e.lastName,
        personalEmail: e.personalEmail,
        workEmail: e.workEmail,
        personalPhone: e.personalPhone,
        profilePhoto: e.profilePhoto,
        department: e.department?.name ?? null,
        departmentId: e.departmentId,
        designation: e.designation?.title ?? null,
        jobTitle: e.jobTitle,
        officeLocation: e.officeLocation?.name ?? null,
        reportingManager: e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : null,
        sourceOfHire: e.sourceOfHire,
        dateOfJoining: e.dateOfJoining,
        tentativeJoiningDate: e.tentativeJoiningDate,
        // Identity / statutory
        panNumber: e.panNumber,
        aadhaarNumber: e.aadhaarNumber,
        uanNumber: e.uanNumber,
        // Professional
        previousExperience: e.previousExperience,
        currentSalary: e.currentSalary != null ? Number(e.currentSalary) : null,
        ctcLpa: salaryMap.get(e.id)?.ctc != null ? Number(salaryMap.get(e.id)!.ctc) / 100000 : null,
        highestQualification: e.highestQualification,
        skillSet: e.skillSet,
        additionalInfo: e.additionalInfo,
        offerLetterUrl: e.offerLetterUrl,
        // Addresses + nested groups (JSON) — exported one-cell-per-group by the client
        currentAddress: e.currentAddress ?? null,
        permanentAddress: e.permanentAddress ?? null,
        emergencyContacts: e.emergencyContacts ?? null,
        educations: e.educations ?? null,
        pastExperiences: e.pastExperiences ?? null,
        certifications: e.certifications ?? null,
        familyMembers: (e.customFields as { familyMembers?: unknown[] } | null)?.familyMembers ?? null,
        onboardingStatus: instanceMap.get(e.id)?.status ?? "NotStarted",
        onboardingInstanceId: instanceMap.get(e.id)?.id ?? null,
      }))
      .filter((c) => !status || c.onboardingStatus === status);

    return successResponse(candidates, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /onboarding/candidates error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = addCandidateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const d = parsed.data;

    const duplicate = await prisma.employee.findFirst({
      where: { orgId, workEmail: d.workEmail, deletedAt: null },
    });
    if (duplicate) return conflict("Work email already exists");

    const employeeCode = await generateEmployeeCode(orgId);
    const joining = d.dateOfJoining || d.tentativeJoiningDate || new Date().toISOString();
    const startDate = new Date(joining);

    const permanent = d.sameAsPresent ? d.currentAddress : d.permanentAddress;

    const employee = await prisma.employee.create({
      data: {
        orgId,
        employeeCode,
        firstName: d.firstName,
        lastName: d.lastName,
        personalEmail: d.personalEmail ?? null,
        workEmail: d.workEmail,
        personalPhone: d.personalPhone ?? null,
        profilePhoto: d.profilePhoto ?? null,
        departmentId: d.departmentId ?? null,
        designationId: d.designationId ?? null,
        officeLocationId: d.officeLocationId ?? null,
        reportingManagerId: d.reportingManagerId ?? null,
        jobTitle: d.jobTitle,
        sourceOfHire: d.sourceOfHire ?? null,
        dateOfJoining: startDate,
        tentativeJoiningDate: d.tentativeJoiningDate ? new Date(d.tentativeJoiningDate) : null,
        panNumber: d.panNumber ?? null,
        aadhaarNumber: d.aadhaarNumber ?? null,
        currentAddress: d.currentAddress ? JSON.parse(JSON.stringify(d.currentAddress)) : undefined,
        permanentAddress: permanent ? JSON.parse(JSON.stringify(permanent)) : undefined,
        previousExperience: d.previousExperience ?? 0,
        skillSet: d.skillSet,
        highestQualification: d.highestQualification,
        additionalInfo: d.additionalInfo,
        currentSalary: d.currentSalary ?? null,
        offerLetterUrl: d.offerLetterUrl ?? null,
        educations: d.educations ? JSON.parse(JSON.stringify(d.educations)) : undefined,
        pastExperiences: d.pastExperiences ? JSON.parse(JSON.stringify(d.pastExperiences)) : undefined,
        emergencyContacts: d.emergencyContacts && d.emergencyContacts.length > 0 ? JSON.parse(JSON.stringify(d.emergencyContacts)) : undefined,
        certifications: d.certifications && d.certifications.length > 0 ? JSON.parse(JSON.stringify(d.certifications)) : undefined,
        customFields: d.familyMembers && d.familyMembers.length > 0 ? { familyMembers: d.familyMembers } : undefined,
        status: "PreBoarding",
        inviteStatus: "NotInvited",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    // RBAC v2: role assignment via UserAppRole join (replaces dropped Employee.roleId).
    if (d.roleId) {
      await prisma.hrmsUserAppRole.create({
        data: {
          orgId: orgId,
          userId: employee.id,
          roleId: d.roleId,
          assignedBy: userId,
        },
      });
    }

    // Salary assignment — always created (required on submit).
    const structure = await prisma.salaryStructure.findFirst({
      where: { id: d.salaryTemplateId, orgId, deletedAt: null },
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
        ctc: d.ctcLpa * 100000,
        effectiveFrom: startDate,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    if (!d.saveDraft) {
      let tasks: TaskTpl[] = [];
      if (d.templateId) {
        const template = await prisma.onboardingTemplate.findFirst({
          where: { id: d.templateId, orgId, deletedAt: null },
        });
        if (template) tasks = template.tasks as unknown as TaskTpl[];
      }

      if (tasks.length === 0) {
        tasks = [
          { title: "Upload ID proof (PAN/Aadhaar)", assigneeRole: "EmployeeRole", dueInDays: 2, category: "Documentation", isMandatory: true, sortOrder: 1 },
          { title: "Sign offer letter", assigneeRole: "EmployeeRole", dueInDays: 3, category: "Documentation", isMandatory: true, sortOrder: 2 },
          { title: "Provision email + SSO", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 3 },
          { title: "Issue laptop", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 4 },
          { title: "Orientation session", assigneeRole: "HRRole", dueInDays: 1, category: "Introduction", isMandatory: true, sortOrder: 5 },
        ];
      }

      const instance = await prisma.onboardingInstance.create({
        data: {
          orgId,
          employeeId: employee.id,
          templateId: d.templateId ?? null,
          startDate,
          status: "InProgress",
          createdBy: userId,
          updatedBy: userId,
          tasks: {
            create: tasks.map((t, idx) => ({
              orgId,
              title: t.title,
              description: t.description,
              assigneeRole: t.assigneeRole as "HRRole",
              category: t.category as "Documentation",
              dueDate: addDays(startDate, t.dueInDays ?? 7),
              isMandatory: t.isMandatory ?? true,
              sortOrder: t.sortOrder ?? idx,
            })),
          },
        },
      });

      await createAuditLog({
        orgId, userId, action: "Create", entityType: "Employee", entityId: employee.id,
        metadata: { onboarding: true, instanceId: instance.id },
      });

      // NOTE: activation email moved to the Confirm Employment step. HR works
      // through onboarding tasks first; the invite goes out only after they
      // explicitly confirm employment.
      return successResponse({ employee, onboardingInstance: instance }, undefined, 201);
    }

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Employee", entityId: employee.id,
      metadata: { draft: true },
    });

    return successResponse({ employee, draft: true }, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/candidates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
