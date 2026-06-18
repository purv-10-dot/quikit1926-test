import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkCompanyHolidaySchema } from "@/lib/validations/settings";
import { yearFromDate } from "@/lib/services/settings";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkCompanyHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const rows = parsed.data.holidays.map((h) => ({
      orgId,
      name: h.name,
      date: new Date(h.date),
      year: yearFromDate(h.date),
      type: h.type,
      isOptional: h.isOptional,
      maxOptionalAllowed: h.maxOptionalAllowed ?? null,
      applicableDepartments: h.applicableDepartments ?? undefined,
      applicableLocations: h.applicableLocations ?? undefined,
      description: h.description,
      createdBy: userId,
      updatedBy: userId,
    }));

    const result = await prisma.companyHoliday.createMany({ data: rows });

    await createAuditLog({
      orgId, userId, action: "Import", entityType: "CompanyHoliday", metadata: { count: result.count },
    });

    return successResponse({ inserted: result.count }, undefined, 201);
  } catch (error) {
    console.error("POST /settings/holidays/bulk error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
