import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createCompanyHolidaySchema } from "@/lib/validations/settings";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import { yearFromDate } from "@/lib/services/settings";
import { invalidateKeys, cacheKeys } from "@/lib/services/cache";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const year = searchParams.get("year");
    const type = searchParams.get("type");
    const search = searchParams.get("search");

    const where: Prisma.CompanyHolidayWhereInput = {
      orgId,
      deletedAt: null,
      ...(year && { year: parseInt(year, 10) }),
      ...(type && { type: type as Prisma.EnumCompanyHolidayTypeFilter["equals"] }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    const [holidays, total] = await Promise.all([
      prisma.companyHoliday.findMany({
        where,
        orderBy: { date: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.companyHoliday.count({ where }),
    ]);

    return successResponse(holidays, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /settings/holidays error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createCompanyHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const {
      date,
      applicableDepartments,
      applicableLocations,
      repeatsYearly,
      repeatYears,
      notifyEmployees,
      ...rest
    } = parsed.data;
    const parsedDate = new Date(date);

    const duplicate = await prisma.companyHoliday.findFirst({
      where: { orgId, deletedAt: null, name: rest.name, date: parsedDate },
      select: { id: true },
    });
    if (duplicate) return validationError("Holiday with same name and date already exists");

    const occurrences: Date[] = [parsedDate];
    if (repeatsYearly) {
      for (let i = 1; i < repeatYears; i++) {
        const next = new Date(parsedDate);
        next.setFullYear(parsedDate.getFullYear() + i);
        occurrences.push(next);
      }
    }

    const created = await prisma.companyHoliday.createManyAndReturn({
      data: occurrences.map((occ) => ({
        orgId,
        ...rest,
        date: occ,
        year: occ.getFullYear(),
        applicableDepartments: applicableDepartments ?? undefined,
        applicableLocations: applicableLocations ?? undefined,
        createdBy: userId,
        updatedBy: userId,
      })),
    });

    await createAuditLog({
      orgId,
      userId,
      action: "Create",
      entityType: "CompanyHoliday",
      entityId: created[0]?.id,
      metadata: { count: created.length, repeatsYearly },
    });
    if (notifyEmployees) {
      await notifyHolidayAnnouncement({
        orgId,
        holiday: created[0],
        applicableDepartments,
        applicableLocations,
        occurrenceCount: created.length,
      }).catch((err) => console.error("Holiday notification fan-out failed:", err));
    }

    return successResponse(
      created.length === 1 ? created[0] : { created: created.length, holidays: created },
      undefined,
      201,
    );
  } catch (error) {
    console.error("POST /settings/holidays error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

async function notifyHolidayAnnouncement(args: {
  orgId: string;
  holiday: { id: string; name: string; date: Date; type: string };
  applicableDepartments?: string[];
  applicableLocations?: string[];
  occurrenceCount: number;
}) {
  const { orgId, holiday, applicableDepartments, applicableLocations, occurrenceCount } = args;
  if (!holiday) return;

  const employees = await prisma.employee.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: "Active",
      ...(applicableDepartments?.length && { departmentId: { in: applicableDepartments } }),
      ...(applicableLocations?.length && { officeLocationId: { in: applicableLocations } }),
    },
    select: { id: true },
  });
  if (employees.length === 0) return;

  const formattedDate = holiday.date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const suffix = occurrenceCount > 1 ? ` (and ${occurrenceCount - 1} more year${occurrenceCount > 2 ? "s" : ""})` : "";

  await prisma.hrmsNotification.createMany({
    data: employees.map((e) => ({
      orgId,
      employeeId: e.id,
      type: "Info" as const,
      channel: "InApp" as const,
      title: `New holiday: ${holiday.name}`,
      message: `${holiday.name} has been announced for ${formattedDate}${suffix}.`,
      link: "/holidays",
      entityType: "CompanyHoliday",
      entityId: holiday.id,
    })),
  });

  // Bust per-user unread cache so badges update on next refetch.
  await invalidateKeys(...employees.map((e) => cacheKeys.notifUnread(orgId, e.id)));
}
