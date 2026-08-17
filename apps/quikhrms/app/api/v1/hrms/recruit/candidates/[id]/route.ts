import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateCandidateSchema } from "@/lib/validations/recruit";
import { offerFromApplication } from "@/lib/recruit/offer-shape";
import { liftExpiredBlacklists } from "@/lib/recruit/blacklist";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    await liftExpiredBlacklists(orgId);
    const c = await prisma.candidate.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        applications: { where: { deletedAt: null }, include: {
          requisition: { select: { id: true, title: true, requisitionNumber: true } },
          interviews: true,
        }},
      },
    });
    if (!c) return notFound("Candidate not found");
    // Offer fields live on the application row now; re-expose the historical
    // `offer` object so existing consumers keep working.
    return successResponse({
      ...c,
      applications: c.applications.map((a) => ({ ...a, offer: offerFromApplication(a) })),
    });
  } catch (error) { console.error("GET /recruit/candidates/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");
    // Blacklisted / archived candidates are read-only — restore or unblock first.
    // (Un-block / un-archive use their own dedicated endpoints, not this PATCH.)
    if (existing.isBlacklisted || existing.isArchived) {
      return validationError(
        existing.isBlacklisted
          ? "This candidate is blacklisted and can't be edited. Lift the blacklist first."
          : "This candidate is archived and can't be edited. Restore them first.",
      );
    }
    const body = await req.json();
    const parsed = updateCandidateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { skills, education, tags, ...rest } = parsed.data;
    const c = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(skills && { skills: JSON.parse(JSON.stringify(skills)) }),
        ...(education && { education: JSON.parse(JSON.stringify(education)) }),
        ...(tags && { tags: JSON.parse(JSON.stringify(tags)) }),
        updatedBy: userId,
      },
    });
    return successResponse(c);
  } catch (error) { console.error("PATCH /recruit/candidates/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Candidate not found");
    await prisma.candidate.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /recruit/candidates/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });
