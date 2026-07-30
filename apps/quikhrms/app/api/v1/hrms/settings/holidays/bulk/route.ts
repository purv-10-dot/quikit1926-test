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
    // Hard cap the batch size — a single import can't submit unbounded rows.
    if (parsed.data.holidays.length > 500) {
      return validationError("Too many holidays in one import (max 500).");
    }

    // Skip holidays that already exist (same name + date) so re-importing a list
    // doesn't create duplicate rows (the single-add route already guards this).
    const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
    const existing = await prisma.companyHoliday.findMany({
      where: { orgId, deletedAt: null },
      select: { name: true, date: true },
    });
    const seen = new Set(existing.map((e) => `${e.name}|${dayKey(e.date)}`));

    const rows = parsed.data.holidays
      .filter((h) => {
        const key = `${h.name}|${dayKey(h.date)}`;
        if (seen.has(key)) return false; // already in DB or earlier in this batch
        seen.add(key);
        return true;
      })
      .map((h) => ({
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

    const result = rows.length ? await prisma.companyHoliday.createMany({ data: rows }) : { count: 0 };
    const skipped = parsed.data.holidays.length - result.count;

    await createAuditLog({
      orgId, userId, action: "Import", entityType: "CompanyHoliday", metadata: { count: result.count, skipped },
    });

    return successResponse({ inserted: result.count, skipped }, undefined, 201);
  } catch (error) {
    console.error("POST /settings/holidays/bulk error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
