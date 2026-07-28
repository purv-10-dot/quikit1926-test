import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";

const screeningSchema = z.object({
  answers: z.record(z.string(), z.string()).default({}),
  technical: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  comments: z.string().optional().default(""),
});

/**
 * POST /api/v1/hrms/recruit/applications/:id/screening
 * Stores the screening-call sheet (prefilled answers + technical Q&A + comments)
 * on the application so it can be reviewed later on the candidate profile.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!app) return notFound("Application not found");

    const parsed = screeningSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const payload = {
      ...parsed.data,
      submittedAt: new Date().toISOString(),
      submittedBy: userId,
    };

    await prisma.jobApplication.update({
      where: { id: params.id },
      data: { screeningAnswers: JSON.parse(JSON.stringify(payload)), updatedBy: userId },
    });

    return successResponse({ saved: true });
  } catch (error) {
    console.error("POST /recruit/applications/:id/screening error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
