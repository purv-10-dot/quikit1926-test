import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

const addMemberSchema = z.union([
  z.object({
    employeeId: z.string().min(1, "Employee required"),
    coverageAmount: z.number().nonnegative().optional().nullable(),
  }),
  z.object({ allEmployees: z.literal(true) }),
]);

const memberEmployeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  department: { select: { name: true } },
  designation: { select: { title: true } },
} as const;

/** GET /api/v1/hrms/documents/[id]/insurance-members — list employees enrolled under this policy. */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const doc = await prisma.document.findFirst({ where: { id: params.id, orgId, deletedAt: null, category: "Insurance" } });
    if (!doc) return notFound("Insurance policy not found");

    const members = await prisma.insurancePolicyMember.findMany({
      where: { orgId, documentId: params.id },
      orderBy: { createdAt: "desc" },
      include: { employee: { select: memberEmployeeSelect } },
    });

    return successResponse(members);
  } catch (error) {
    console.error("GET /documents/[id]/insurance-members error:", error);
    return internalError();
  }
});

/** POST /api/v1/hrms/documents/[id]/insurance-members — enroll one employee in this policy. */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const body = await req.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const doc = await prisma.document.findFirst({ where: { id: params.id, orgId, deletedAt: null, category: "Insurance" } });
    if (!doc) return notFound("Insurance policy not found");

    if ("allEmployees" in parsed.data) {
      const [allEmployees, existingMembers] = await Promise.all([
        prisma.employee.findMany({ where: { orgId, deletedAt: null }, select: { id: true } }),
        prisma.insurancePolicyMember.findMany({ where: { orgId, documentId: params.id }, select: { employeeId: true } }),
      ]);
      const alreadyIn = new Set(existingMembers.map((m) => m.employeeId));
      const toAdd = allEmployees.filter((e) => !alreadyIn.has(e.id));
      if (toAdd.length === 0) return successResponse({ count: 0 }, undefined, 201);

      const result = await prisma.insurancePolicyMember.createMany({
        data: toAdd.map((e) => ({ orgId, documentId: params.id, employeeId: e.id, addedBy: userId })),
      });

      await createAuditLog({
        orgId, userId, action: "Create", entityType: "InsurancePolicyMember", entityId: params.id,
        metadata: { documentId: params.id, bulk: true, count: result.count },
      });

      return successResponse({ count: result.count }, undefined, 201);
    }

    const emp = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, orgId, deletedAt: null }, select: { id: true } });
    if (!emp) return validationError("Employee not found in your organization.");

    const existing = await prisma.insurancePolicyMember.findUnique({
      where: { documentId_employeeId: { documentId: params.id, employeeId: parsed.data.employeeId } },
    });
    if (existing) return validationError("This employee is already enrolled in this policy.");

    const member = await prisma.insurancePolicyMember.create({
      data: {
        orgId, documentId: params.id, employeeId: parsed.data.employeeId, addedBy: userId,
        coverageAmount: parsed.data.coverageAmount ?? undefined,
      },
      include: { employee: { select: memberEmployeeSelect } },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "InsurancePolicyMember", entityId: member.id,
      metadata: { documentId: params.id, employeeId: parsed.data.employeeId },
    });

    return successResponse(member, undefined, 201);
  } catch (error) {
    console.error("POST /documents/[id]/insurance-members error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write", "hrms.document.write_self"], anyPermission: true });
