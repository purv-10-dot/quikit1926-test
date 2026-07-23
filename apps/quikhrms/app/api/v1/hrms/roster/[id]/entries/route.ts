import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, notFound, validationError, internalError } from "@/lib/api-response";
import { rosterEntriesSchema } from "@/lib/validations/roster";
import { getHierarchyAccessibleEmployeeIds } from "@/lib/rbac/hierarchy";

/**
 * POST /api/v1/hrms/roster/:id/entries — bulk upsert / clear roster cells.
 * Each entry with `clear: true` is removed; otherwise it is upserted by
 * (rosterId, employeeId, date). Only Draft rosters are editable.
 */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId, permissions } = ctx;
    if (!(permissions.includes("*") || permissions.includes("hrms.roster.manage"))) {
      return forbidden("No roster manage permission");
    }

    const roster = await prisma.roster.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!roster) return notFound("Roster not found");
    if (roster.status !== "Draft") return validationError("Only a draft roster can be edited");

    const body = await req.json();
    const parsed = rosterEntriesSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { entries } = parsed.data;

    // Hierarchy guard: every target employee must be within reach.
    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    if (!hierarchy.unlimited) {
      const allowed = new Set(hierarchy.employeeIds ?? []);
      if (entries.some((e) => !allowed.has(e.employeeId))) {
        return forbidden("Cannot edit roster for an employee above your role hierarchy");
      }
    }

    // Verify every referenced shift exists in this org — an invalid shiftId would
    // otherwise throw a Prisma FK error inside the transaction → generic 500.
    const shiftIds = [...new Set(entries.map((e) => e.shiftId).filter((id): id is string => !!id))];
    if (shiftIds.length > 0) {
      const found = await prisma.shiftPolicy.findMany({
        where: { orgId, deletedAt: null, id: { in: shiftIds } },
        select: { id: true },
      });
      if (found.length !== shiftIds.length) {
        return validationError("One or more selected shifts no longer exist.");
      }
    }

    const ops = entries.map((e) =>
      e.clear
        ? prisma.rosterEntry.deleteMany({
            where: { rosterId: roster.id, employeeId: e.employeeId, date: e.date },
          })
        : prisma.rosterEntry.upsert({
            where: { rosterId_employeeId_date: { rosterId: roster.id, employeeId: e.employeeId, date: e.date } },
            create: {
              orgId,
              rosterId: roster.id,
              employeeId: e.employeeId,
              date: e.date,
              shiftId: e.shiftId ?? null,
              type: e.type,
              note: e.note,
              createdBy: userId,
              updatedBy: userId,
            },
            update: { shiftId: e.shiftId ?? null, type: e.type, note: e.note, deletedAt: null, updatedBy: userId },
          }),
    );
    await prisma.$transaction(ops);

    return successResponse({ count: entries.length });
  } catch (error) {
    console.error("POST /roster/:id/entries error:", error);
    return internalError();
  }
});
