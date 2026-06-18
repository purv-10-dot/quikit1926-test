import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, validationError, unauthorized, internalError } from "@/lib/api-response";
import { portalLoginSchema } from "@/lib/validations/gap-fill";

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = portalLoginSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const access = await prisma.candidatePortalAccess.findUnique({
      where: { accessToken: parsed.data.token },
    });
    if (!access) return unauthorized("Invalid token");
    if (!access.isActive) return unauthorized("Access revoked");
    if (access.expiresAt && access.expiresAt < new Date()) return unauthorized("Token expired");

    const candidate = await prisma.candidate.findFirst({
      where: { id: access.candidateId, orgId: access.orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        currentCompany: true, status: true, createdAt: true,
      },
    });

    const applicationRows = await prisma.jobApplication.findMany({
      where: { orgId: access.orgId, candidateId: access.candidateId, deletedAt: null },
      include: {
        requisition: { select: { id: true, title: true, departmentId: true } },
        interviews: { orderBy: { scheduledAt: "asc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
    });
    // Offer fields live on the application row now; re-expose the historical
    // `offer` object the portal UI expects.
    const applications = applicationRows.map((a) => ({
      ...a,
      offer: a.offerStatus != null
        ? { status: a.offerStatus, offeredCTC: a.offeredCTC, joiningDate: a.offerJoiningDate, sentAt: a.offerSentAt }
        : null,
    }));

    await prisma.candidatePortalAccess.update({
      where: { id: access.id },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    return successResponse({ candidate, applications, orgId: access.orgId });
  } catch (error) {
    console.error("POST /candidate-portal/login error:", error);
    return internalError();
  }
};
