import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateCompanyHolidaySchema } from "@/lib/validations/settings";
import { yearFromDate } from "@/lib/services/settings";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateCompanyHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.companyHoliday.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Holiday not found");

    const { date, applicableDepartments, applicableLocations, ...rest } = parsed.data;

    const holiday = await prisma.companyHoliday.update({
      where: { id },
      data: {
        ...rest,
        ...(date && { date: new Date(date), year: yearFromDate(date) }),
        ...(applicableDepartments !== undefined && { applicableDepartments: applicableDepartments ?? undefined }),
        ...(applicableLocations !== undefined && { applicableLocations: applicableLocations ?? undefined }),
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "CompanyHoliday", entityId: id, changes: parsed.data,
    });

    return successResponse(holiday);
  } catch (error) {
    console.error("PUT /settings/holidays/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.companyHoliday.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Holiday not found");

    await prisma.companyHoliday.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "CompanyHoliday", entityId: id,
    });

    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /settings/holidays/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
