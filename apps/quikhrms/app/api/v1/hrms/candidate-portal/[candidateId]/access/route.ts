import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { issuePortalAccessSchema } from "@/lib/validations/gap-fill";
import { generatePortalToken } from "@/lib/services/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = issuePortalAccessSchema.safeParse({ ...body, candidateId: params.candidateId });
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const candidate = await prisma.candidate.findFirst({
      where: { id: params.candidateId, orgId, deletedAt: null },
    });
    if (!candidate) return notFound("Candidate not found");

    const token = generatePortalToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parsed.data.expiresInDays);

    const access = await prisma.candidatePortalAccess.upsert({
      where: { orgId_candidateId: { orgId, candidateId: params.candidateId } },
      create: {
        orgId, candidateId: params.candidateId, email: candidate.email,
        accessToken: token, expiresAt, isActive: true,
      },
      update: { accessToken: token, expiresAt, isActive: true },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "CandidatePortalAccess",
      entityId: access.id, metadata: { candidateId: params.candidateId },
    });

    const portalUrl = `/candidate-portal/${token}`;

    return successResponse({ access, portalUrl, token });
  } catch (error) {
    console.error("POST /candidate-portal/[id]/access error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const access = await prisma.candidatePortalAccess.findUnique({
      where: { orgId_candidateId: { orgId, candidateId: params.candidateId } },
    });
    return successResponse(access);
  } catch (error) {
    console.error("GET /candidate-portal/[id]/access error:", error);
    return internalError();
  }
});
