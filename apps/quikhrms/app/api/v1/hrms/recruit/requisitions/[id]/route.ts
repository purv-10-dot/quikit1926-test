import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateRequisitionSchema } from "@/lib/validations/recruit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const r = await prisma.jobRequisition.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        recruiter: { select: { id: true, firstName: true, lastName: true } },
        applications: { where: { deletedAt: null }, include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        }},
      },
    });
    if (!r) return notFound("Requisition not found");
    return successResponse(r);
  } catch (error) { console.error("GET /recruit/requisitions/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Requisition not found");
    const body = await req.json();
    const parsed = updateRequisitionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { responsibilities, requirements, niceToHave, skills, skillWeights, benefits, ...rest } = parsed.data;
    const r = await prisma.jobRequisition.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(responsibilities && { responsibilities: JSON.parse(JSON.stringify(responsibilities)) }),
        ...(requirements && { requirements: JSON.parse(JSON.stringify(requirements)) }),
        ...(niceToHave && { niceToHave: JSON.parse(JSON.stringify(niceToHave)) }),
        ...(skills && { skills: JSON.parse(JSON.stringify(skills)) }),
        ...(skillWeights && { skillWeights: JSON.parse(JSON.stringify(skillWeights)) }),
        ...(benefits && { benefits: JSON.parse(JSON.stringify(benefits)) }),
        ...(rest.status === "ReqClosed" && { closedDate: new Date() }),
        updatedBy: userId,
      },
    });
    return successResponse(r);
  } catch (error) { console.error("PATCH /recruit/requisitions/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Requisition not found");
    await prisma.jobRequisition.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /recruit/requisitions/:id error:", error); return internalError(); }
});
