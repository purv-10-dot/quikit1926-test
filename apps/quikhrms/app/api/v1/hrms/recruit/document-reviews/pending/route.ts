import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const uploads = await prisma.candidateDocumentUpload.findMany({
      where: { orgId, status: "Pending", deletedAt: null },
      orderBy: { uploadedAt: "asc" },
      include: {
        documentType: { select: { id: true, name: true, code: true, isRequired: true } },
        request: {
          select: {
            id: true, status: true, applicationId: true,
            application: {
              select: {
                id: true,
                candidate: { select: { firstName: true, lastName: true, email: true } },
                requisition: { select: { title: true } },
                currentStage: true,
              },
            },
          },
        },
      },
    });
    return successResponse(uploads);
  } catch (e) {
    console.error("GET pending reviews", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
