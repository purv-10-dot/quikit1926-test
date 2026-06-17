import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updatePIPSchema } from "@/lib/validations/performance";
import { fireWorkflow } from "@/lib/workflows/executor";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const pip = await prisma.pIP.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true, department: { select: { name: true } } } },
        initiatedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!pip) return notFound("PIP not found");
    return successResponse(pip);
  } catch (error) { console.error("GET /pip/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.pIP.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("PIP not found");
    const body = await req.json();
    const parsed = updatePIPSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedBy: userId };
    if (data.status) updateData.status = data.status;
    if (data.outcome) updateData.outcome = data.outcome;
    if (data.objectives) updateData.objectives = JSON.parse(JSON.stringify(data.objectives));
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const pip = await prisma.pIP.update({ where: { id: params.id }, data: updateData });

    // Notify employee on terminal status transition.
    if (data.status && data.status !== existing.status && ["PIPCompletedSuccess", "PIPFailed", "PIPExtended", "PIPWithdrawn"].includes(data.status)) {
      const titleMap: Record<string, { title: string; type: "Success" | "Error" | "Info" }> = {
        PIPCompletedSuccess: { title: "PIP completed successfully", type: "Success" },
        PIPFailed:           { title: "PIP closed — not met",       type: "Error"   },
        PIPExtended:         { title: "Your PIP has been extended", type: "Info"    },
        PIPWithdrawn:        { title: "Your PIP was withdrawn",     type: "Info"    },
      };
      const t = titleMap[data.status];
      await prisma.hrmsNotification.create({
        data: {
          orgId,
          employeeId: pip.employeeId,
          type: t.type,
          channel: "InApp",
          title: t.title,
          message: data.outcome ? `Outcome: ${data.outcome}` : "Status updated.",
          link: "/performance/pip",
          entityType: "PIP",
          entityId: pip.id,
        },
      });

      if (data.status === "PIPCompletedSuccess" || data.status === "PIPFailed") {
        void fireWorkflow({
          orgId,
          event: "performance.pip.completed",
          payload: { employeeId: pip.employeeId, pipId: pip.id, outcome: data.outcome ?? data.status },
        });
      }
    }

    return successResponse(pip);
  } catch (error) { console.error("PATCH /pip/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.pIP.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("PIP not found");
    await prisma.pIP.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ id: params.id, deleted: true });
  } catch (error) { console.error("DELETE /pip/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.settings.write"] });
