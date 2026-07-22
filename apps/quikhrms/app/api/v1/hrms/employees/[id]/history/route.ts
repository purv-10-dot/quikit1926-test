import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { createEmploymentHistorySchema } from "@/lib/validations/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const history = await prisma.employmentHistory.findMany({
      where: { orgId, employeeId: params.id },
      orderBy: { effectiveDate: "desc" },
    });
    return successResponse(history);
  } catch (error) {
    console.error("GET /employees/[id]/history error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = createEmploymentHistorySchema.safeParse({ ...body, employeeId: params.id });
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const d = parsed.data;

    // Guard the FK: a missing / cross-org employee would otherwise throw a Prisma
    // FK error caught by the generic catch → "Something went wrong".
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const entry = await prisma.employmentHistory.create({
      data: {
        orgId,
        employeeId: d.employeeId,
        changeType: d.changeType,
        fromValue: d.fromValue ? JSON.parse(JSON.stringify(d.fromValue)) : undefined,
        toValue: JSON.parse(JSON.stringify(d.toValue)),
        effectiveDate: new Date(d.effectiveDate),
        reason: d.reason,
        approvedBy: userId,
        letterUrl: d.letterUrl,
        notes: d.notes,
        createdBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "EmploymentHistory",
      entityId: entry.id, metadata: { employeeId: d.employeeId, changeType: d.changeType },
    });

    return successResponse(entry, undefined, 201);
  } catch (error) {
    console.error("POST /employees/[id]/history error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"] });
