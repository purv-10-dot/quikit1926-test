import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/** POST body:
 * { reason: string, durationDays?: number }
 * durationDays omitted or null = permanent blacklist.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const reason = String(body.reason ?? "").trim();
    if (!reason) return validationError("Blacklist reason is required");

    const durationDays = body.durationDays === null || body.durationDays === undefined
      ? null
      : Number(body.durationDays);
    if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays <= 0)) {
      return validationError("durationDays must be a positive number or null for permanent");
    }

    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");

    const blacklistedAt = new Date();
    const blacklistedUntil = durationDays ? new Date(Date.now() + durationDays * 86400_000) : null;

    const updated = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        isBlacklisted: true,
        blacklistReason: reason,
        blacklistedAt,
        blacklistedBy: userId,
        blacklistedUntil,
        status: "Blacklisted",
        doNotContact: true,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Candidate", entityId: params.id,
      changes: { isBlacklisted: true, blacklistReason: reason, blacklistedUntil, action: "Blacklisted" },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /recruit/candidates/:id/blacklist error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");
    if (!existing.isBlacklisted) return validationError("Candidate is not blacklisted");

    const updated = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        isBlacklisted: false,
        blacklistReason: null,
        blacklistedAt: null,
        blacklistedBy: null,
        blacklistedUntil: null,
        status: existing.status === "Blacklisted" ? "New" : existing.status,
        doNotContact: false,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Candidate", entityId: params.id,
      changes: { action: "Unblacklisted" },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("DELETE /recruit/candidates/:id/blacklist error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
