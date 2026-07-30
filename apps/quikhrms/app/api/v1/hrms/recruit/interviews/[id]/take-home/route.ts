import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

// GET /api/v1/hrms/recruit/interviews/:id/take-home
// Authed reviewer view of a take-home interview's brief + candidate submission.
// The take-home columns aren't in the (un-regenerated) Prisma client, so this
// reads them via raw SQL.

interface Row {
  id: string;
  type: string;
  takeHomeInstructions: string | null;
  takeHomeAttachmentUrl: string | null;
  takeHomeDueDate: Date | null;
  submissionUrl: string | null;
  submissionFileName: string | null;
  submissionNote: string | null;
  submittedAt: Date | null;
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, type::text AS type, "takeHomeInstructions", "takeHomeAttachmentUrl",
             "takeHomeDueDate", "submissionUrl", "submissionFileName",
             "submissionNote", "submittedAt"
      FROM "app_quikhrms"."Interview"
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1`;
    const iv = rows[0];
    if (!iv || iv.type !== "TakeHome") return notFound("Take-home interview not found");

    return successResponse({
      id: iv.id,
      instructions: iv.takeHomeInstructions,
      hasAttachment: !!iv.takeHomeAttachmentUrl,
      attachmentUrl: iv.takeHomeAttachmentUrl,
      dueDate: iv.takeHomeDueDate ? new Date(iv.takeHomeDueDate).toISOString().slice(0, 10) : null,
      submission: iv.submittedAt
        ? {
            url: iv.submissionUrl,
            fileName: iv.submissionFileName,
            note: iv.submissionNote,
            submittedAt: iv.submittedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /recruit/interviews/:id/take-home error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
