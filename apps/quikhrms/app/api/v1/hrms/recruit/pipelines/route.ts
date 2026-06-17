import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createPipelineSchema } from "@/lib/validations/recruit";
import { normalizeStages, ensureRequiredStages } from "@/lib/services/pipeline-stages";

const DEFAULT_STAGES = [
  { name: "Screening", sendMail: false, mailTemplate: null },
  { name: "PhoneScreen", sendMail: false, mailTemplate: "interview" },
  { name: "TechnicalInterview", sendMail: false, mailTemplate: "interview" },
  { name: "ManagerInterview", sendMail: false, mailTemplate: "interview" },
  { name: "HRInterview", sendMail: false, mailTemplate: "interview" },
  { name: "Offer", sendMail: false, mailTemplate: "offer-branded" },
  { name: "Hired", sendMail: false, mailTemplate: "welcome" },
];

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const normalized = await (async () => {
        const selectWithCount = {
          _count: {
            select: { requisitions: { where: { deletedAt: null } } },
          },
        } as const;

        let pipelines = await prisma.hiringPipeline.findMany({
          where: { orgId, deletedAt: null },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          include: selectWithCount,
        });

        if (pipelines.length === 0) {
          await prisma.hiringPipeline.create({
            data: {
              orgId,
              name: "Default Hiring Pipeline",
              stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
              isDefault: true,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          pipelines = await prisma.hiringPipeline.findMany({
            where: { orgId, deletedAt: null },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            include: selectWithCount,
          });
        }

        return pipelines.map((p) => ({
          ...p,
          stages: normalizeStages(p.stages),
          requisitionCount: p._count.requisitions,
        }));
      })();

    return successResponse(normalized);
  } catch (error) { console.error("GET /recruit/pipelines error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createPipelineSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const stages = ensureRequiredStages(normalizeStages(parsed.data.stages));

    if (parsed.data.isDefault === true) {
      await prisma.hiringPipeline.updateMany({
        where: { orgId, deletedAt: null },
        data: { isDefault: false },
      });
    }

    const pipeline = await prisma.hiringPipeline.create({
      data: {
        orgId,
        name: parsed.data.name,
        stages: JSON.parse(JSON.stringify(stages)),
        isDefault: parsed.data.isDefault ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return successResponse({ ...pipeline, stages: normalizeStages(pipeline.stages) }, undefined, 201);
  } catch (error) { console.error("POST /recruit/pipelines error:", error); return internalError(); }
});
