import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateTeamSchema } from "@/lib/validations/organization";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const team = await prisma.hrmsTeam.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        lead: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        employees: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true },
        },
      },
    });
    if (!team) return notFound("Team not found");
    return successResponse(team);
  } catch (error) {
    console.error("GET /teams/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsTeam.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Team not found");

    const body = await req.json();
    const parsed = updateTeamSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const team = await prisma.hrmsTeam.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(team);
  } catch (error) {
    console.error("PATCH /teams/:id error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsTeam.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Team not found");

    await prisma.hrmsTeam.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /teams/:id error:", error);
    return internalError();
  }
});
