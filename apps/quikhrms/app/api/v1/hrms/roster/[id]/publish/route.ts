import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, notFound, validationError, internalError } from "@/lib/api-response";

/**
 * POST /api/v1/hrms/roster/:id/publish — publish a Draft roster (locks it,
 * drives attendance, notifies affected employees) or reopen a Published one.
 * Body: { action?: "publish" | "reopen" } (default "publish").
 */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId, permissions } = ctx;
    if (!(permissions.includes("*") || permissions.includes("hrms.roster.manage"))) {
      return forbidden("No roster manage permission");
    }

    const roster = await prisma.roster.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, name: true, status: true, periodStart: true, periodEnd: true },
    });
    if (!roster) return notFound("Roster not found");

    const body = await req.json().catch(() => ({}));
    const action = body.action === "reopen" ? "reopen" : "publish";

    if (action === "reopen") {
      if (roster.status !== "Published") return validationError("Only a published roster can be reopened");
      const updated = await prisma.roster.update({
        where: { id: roster.id },
        data: { status: "Draft", publishedAt: null, publishedBy: null, updatedBy: userId },
      });
      return successResponse(updated);
    }

    if (roster.status !== "Draft") return validationError("Only a draft roster can be published");

    const updated = await prisma.roster.update({
      where: { id: roster.id },
      data: { status: "Published", publishedAt: new Date(), publishedBy: userId, updatedBy: userId },
    });

    // Notify every employee who has a cell in this roster (best-effort).
    try {
      const grouped = await prisma.rosterEntry.groupBy({
        by: ["employeeId"],
        where: { orgId, rosterId: roster.id, deletedAt: null },
      });
      const employeeIds = grouped.map((g) => g.employeeId);
      if (employeeIds.length) {
        const period = `${roster.periodStart.toISOString().slice(0, 10)} → ${roster.periodEnd.toISOString().slice(0, 10)}`;
        await prisma.hrmsNotification.createMany({
          data: employeeIds.map((employeeId) => ({
            orgId,
            employeeId,
            type: "Info" as const,
            channel: "InApp" as const,
            title: "Your duty roster is published",
            message: `Roster "${roster.name}" (${period}) has been published. Check your shifts and week-offs.`,
            link: "/duty-roster",
            entityType: "Roster",
            entityId: roster.id,
          })),
        });
      }
    } catch (notifyErr) {
      console.error("roster publish notify failed:", notifyErr);
    }

    return successResponse(updated);
  } catch (error) {
    console.error("POST /roster/:id/publish error:", error);
    return internalError();
  }
});
