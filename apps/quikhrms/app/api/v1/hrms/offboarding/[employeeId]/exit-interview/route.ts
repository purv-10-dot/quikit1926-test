import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { submitExitInterviewSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { employeeId } = params;
    const body = await req.json();
    const parsed = submitExitInterviewSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
    });
    if (!instance) return notFound("Offboarding not found");

    const structuredNotes = {
      notes: parsed.data.notes,
      rating: parsed.data.rating,
      reasonForLeaving: parsed.data.reasonForLeaving,
      wouldRejoin: parsed.data.wouldRejoin,
      feedback: parsed.data.feedback,
    };

    const updated = await prisma.offboardingInstance.update({
      where: { id: instance.id },
      data: {
        exitInterviewDone: true,
        exitInterviewAt: new Date(),
        exitInterviewNotes: JSON.stringify(structuredNotes),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OffboardingInstance", entityId: instance.id, metadata: { exitInterview: true } });
    return successResponse(updated, undefined, 201);
  } catch (error) {
    console.error("POST /offboarding/[employeeId]/exit-interview error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
