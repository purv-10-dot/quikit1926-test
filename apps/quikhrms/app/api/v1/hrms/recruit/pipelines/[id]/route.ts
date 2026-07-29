import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, conflict } from "@/lib/api-response";
import { updatePipelineSchema } from "@/lib/validations/recruit";
import { normalizeStages, ensureRequiredStages } from "@/lib/services/pipeline-stages";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const p = await prisma.hiringPipeline.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!p) return notFound("Pipeline not found");
    return successResponse({ ...p, stages: normalizeStages(p.stages) });
  } catch (error) { console.error("GET /recruit/pipelines/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hiringPipeline.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Pipeline not found");

    const body = await req.json();
    const parsed = updatePipelineSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    if (parsed.data.isDefault === true) {
      await prisma.hiringPipeline.updateMany({
        where: { orgId, deletedAt: null, id: { not: params.id } },
        data: { isDefault: false },
      });
    }

    const stages = parsed.data.stages !== undefined ? ensureRequiredStages(normalizeStages(parsed.data.stages)) : undefined;

    const updated = await prisma.hiringPipeline.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(stages !== undefined && { stages: JSON.parse(JSON.stringify(stages)) }),
        ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
        updatedBy: userId,
      },
    });

    return successResponse({ ...updated, stages: normalizeStages(updated.stages) });
  } catch (error) { console.error("PATCH /recruit/pipelines/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hiringPipeline.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Pipeline not found");
    if (existing.isDefault) return validationError("Cannot delete the default pipeline");

    const requisitionCount = await prisma.jobRequisition.count({
      where: { orgId, pipelineId: params.id, deletedAt: null },
    });
    if (requisitionCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — ${requisitionCount} active requisition${requisitionCount === 1 ? "" : "s"} still use this pipeline. Reassign them to another pipeline first.`,
      );
    }

    await prisma.hiringPipeline.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /recruit/pipelines/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });
