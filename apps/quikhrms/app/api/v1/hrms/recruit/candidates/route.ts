import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createCandidateSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { liftExpiredBlacklists } from "@/lib/recruit/blacklist";
import type { Prisma, CandidateStatus } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    await liftExpiredBlacklists(orgId);
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const excludeStatus = searchParams.get("excludeStatus")?.split(",").filter(Boolean) ?? [];
    // Hide candidates whose application has reached one of these pipeline stages (e.g. "Hired").
    const excludeStage = searchParams.get("excludeStage")?.split(",").filter(Boolean) ?? [];
    const source = searchParams.get("source");
    const expMin = searchParams.get("expMin");
    const expMax = searchParams.get("expMax");
    const includeArchived = searchParams.get("includeArchived") === "1";
    const onlyArchived = searchParams.get("archived") === "1";
    const onlyBlacklisted = searchParams.get("blacklisted") === "1";
    // Global search — span Active + Blacklisted + Archived (not tab-dependent).
    const searchAll = searchParams.get("searchAll") === "1";

    const where: Prisma.CandidateWhereInput = {
      orgId, deletedAt: null,
      ...(searchAll ? {} : onlyArchived
        ? { isArchived: true }
        : includeArchived ? {} : { isArchived: false }),
      ...(searchAll ? {} : onlyBlacklisted
        ? { isBlacklisted: true }
        : onlyArchived ? {} : { isBlacklisted: false }),
      ...(status && { status: status as Prisma.CandidateWhereInput["status"] }),
      ...(excludeStatus.length && { status: { notIn: excludeStatus as CandidateStatus[] } }),
      ...(excludeStage.length && { applications: { none: { deletedAt: null, currentStage: { in: excludeStage } } } }),
      ...(source && { source: source as Prisma.CandidateWhereInput["source"] }),
      ...((expMin || expMax) && {
        totalExperience: {
          ...(expMin ? { gte: Number(expMin) } : {}),
          ...(expMax ? { lte: Number(expMax) } : {}),
        },
      }),
      ...(search && { OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ] }),
    };

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          currentCompany: true,
          currentDesignation: true,
          totalExperience: true,
          expectedCTC: true,
          source: true,
          status: true,
          rating: true,
          location: true,
          isBlacklisted: true,
          blacklistReason: true,
          blacklistedAt: true,
          blacklistedUntil: true,
          isArchived: true,
          archiveReason: true,
          archivedAt: true,
          createdAt: true,
          _count: { select: { applications: true } },
          applications: {
            where: { deletedAt: null },
            orderBy: { appliedDate: "desc" },
            take: 1,
            select: { id: true, currentStage: true, status: true, requisition: { select: { id: true, title: true, requisitionNumber: true } } },
          },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    // Reconcile any drifted candidate.status with the latest application so the
    // list reflects pipeline actions (incl. ones taken before status-sync existed).
    const APP_TO_CAND: Record<string, CandidateStatus> = {
      AppRejected: "CandRejected",
      AppOnHold: "CandOnHold",
      AppHired: "Hired",
      AppActive: "InPipeline",
      AppOffered: "InPipeline",
    };
    await Promise.all(candidates.map(async (c) => {
      if (c.isBlacklisted) return;
      const appStatus = c.applications?.[0]?.status;
      const want = appStatus ? APP_TO_CAND[appStatus] : undefined;
      if (want && c.status !== want) {
        c.status = want;
        await prisma.candidate.update({ where: { id: c.id }, data: { status: want } }).catch(() => null);
      }
    }));

    return successResponse(candidates, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/candidates error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createCandidateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const existing = await prisma.candidate.findFirst({ where: { orgId, email: data.email, deletedAt: null } });
    if (existing) {
      if (existing.isBlacklisted) {
        const until = existing.blacklistedUntil
          ? ` until ${new Date(existing.blacklistedUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
          : " permanently";
        const reason = existing.blacklistReason ? ` — reason: ${existing.blacklistReason}` : "";
        return conflict(`This candidate is blacklisted${until}${reason}. They cannot be added.`);
      }
      if (existing.status === "CandRejected") {
        return conflict("This candidate already exists and was previously rejected. Open their profile to apply them to a new role.");
      }
      return conflict("Candidate with this email already exists. Open their profile to apply them to a role.");
    }

    const candidate = await prisma.candidate.create({
      data: {
        orgId, ...data,
        skills: data.skills ? JSON.parse(JSON.stringify(data.skills)) : undefined,
        education: data.education ? JSON.parse(JSON.stringify(data.education)) : undefined,
        tags: data.tags ? JSON.parse(JSON.stringify(data.tags)) : undefined,
        createdBy: userId, updatedBy: userId,
      },
    });
    void fireWorkflow({
      orgId, event: "recruit.candidate.created",
      payload: { candidateId: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`, source: candidate.source },
    });

    return successResponse(candidate, undefined, 201);
  } catch (error) { console.error("POST /recruit/candidates error:", error); return internalError(); }
});
