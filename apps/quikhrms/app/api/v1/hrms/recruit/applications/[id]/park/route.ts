import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { parkApplicationSchema } from "@/lib/validations/recruit";
import { createAuditLog } from "@/lib/utils/audit";

/** POST body: { reason: "LessExperience"|"HighBudget"|"NonRelevant"|"Other", note?: string } —
 * "Park Candidate": not a fit for THIS role, set aside (not rejected) for future reference. */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parkApplicationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { reason, note } = parsed.data;

    const existing = await prisma.jobApplication.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Application not found");
    if (existing.status === "AppParked") return validationError("Application is already parked");
    if (existing.status === "AppHired" || existing.status === "AppRejected") {
      return validationError(`Cannot park an application that is already ${existing.status === "AppHired" ? "hired" : "rejected"}`);
    }

    const updated = await prisma.jobApplication.update({
      where: { id: params.id },
      data: {
        status: "AppParked",
        parkedReason: reason,
        parkedNote: note?.trim() || null,
        parkedAt: new Date(),
        parkedBy: userId,
        updatedBy: userId,
      },
    });

    // Reflect on the candidate so the Candidates list can filter them as Parked.
    await prisma.candidate.update({
      where: { id: existing.candidateId },
      data: { status: "CandParked" },
    }).catch(() => null);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "JobApplication", entityId: params.id,
      changes: { action: "Parked", reason, note: note?.trim() || undefined },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /recruit/applications/:id/park error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });

/** Unpark — restores the application to Active in the pipeline. */
export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobApplication.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Application not found");
    if (existing.status !== "AppParked") return validationError("Application is not parked");

    const updated = await prisma.jobApplication.update({
      where: { id: params.id },
      data: {
        status: "AppActive",
        parkedReason: null,
        parkedNote: null,
        parkedAt: null,
        parkedBy: null,
        updatedBy: userId,
      },
    });

    await prisma.candidate.update({
      where: { id: existing.candidateId },
      data: { status: "InPipeline" },
    }).catch(() => null);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "JobApplication", entityId: params.id,
      changes: { action: "Unparked" },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("DELETE /recruit/applications/:id/park error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });
