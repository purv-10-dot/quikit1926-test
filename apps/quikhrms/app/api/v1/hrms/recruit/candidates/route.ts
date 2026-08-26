import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError, forbidden } from "@/lib/api-response";
import { createCandidateSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { liftExpiredBlacklists } from "@/lib/recruit/blacklist";
import { generateCandidateCode } from "@/lib/utils/candidate-code";
import { stageNames } from "@/lib/services/pipeline-stages";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getMyJobRequisitionIds } from "@/lib/recruit/my-jobs";
import { Prisma, type CandidateStatus } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.read_self");
    if (!canSeeSelf) return forbidden("No recruitment read permission");

    // Recruiter (self-only) scope: only candidates who have an application to
    // one of their own requisitions — Candidate Pool (no application at all)
    // is intentionally never visible to a self-scoped caller, by design.
    let myJobIds: string[] | null = null;
    if (!canSeeAll) {
      const employeeId = await resolveEmployeeId(orgId, userId);
      myJobIds = employeeId ? await getMyJobRequisitionIds(orgId, employeeId) : [];
    }

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
    // Candidate Pool — sourced candidates never linked to (or no longer linked
    // to) any requisition. Distinct from `source` (LinkedIn/Referral/etc, the
    // channel a candidate came from).
    const noApplication = searchParams.get("noApplication") === "1";
    // Opposite of noApplication — used by the Active tab so sourced-only
    // (no JR yet) candidates never leak in regardless of the status filter.
    const hasApplication = searchParams.get("hasApplication") === "1";
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
      // Each of these targets `applications` independently — combined via AND
      // (not spread onto the same key) so they don't silently overwrite one
      // another when more than one is active at once.
      AND: [
        ...(excludeStage.length ? [{ applications: { none: { deletedAt: null, currentStage: { in: excludeStage } } } }] : []),
        ...(noApplication ? [{ applications: { none: { deletedAt: null } } }] : []),
        ...(hasApplication ? [{ applications: { some: { deletedAt: null } } }] : []),
        ...(myJobIds !== null ? [{ applications: { some: { deletedAt: null, requisitionId: { in: myJobIds } } } }] : []),
      ],
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
          currentCTC: true,
          expectedCTC: true,
          noticePeriod: true,
          source: true,
          status: true,
          rating: true,
          location: true,
          willingToRelocate: true,
          skills: true,
          education: true,
          tags: true,
          linkedinUrl: true,
          portfolioUrl: true,
          resumeUrl: true,
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
            select: { id: true, currentStage: true, status: true, requisition: { select: { id: true, title: true, requisitionNumber: true, pipelineId: true } } },
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
      AppParked: "CandParked",
      AppHired: "Hired",
      // AppActive/AppOffered are resolved below (New vs InPipeline depends on
      // whether the application has actually left its pipeline's first stage).
      // Previously missing — a withdrawn/declined application left the
      // candidate's own status stuck at whatever it was before (often still
      // "InPipeline"), so they kept showing as in-pipeline with a stage badge
      // here even though the Pipeline board itself never shows AppWithdrawn
      // applications at all (not even under "Show closed").
      AppWithdrawn: "Withdrawn",
      AppDeclined: "Withdrawn",
    };

    // First-stage name per pipeline, so a candidate still sitting at their
    // pipeline's raw first stage (no screening action taken yet) reads as
    // "New" rather than "InPipeline" — matches how application creation
    // itself decides New vs InPipeline (see POST /recruit/applications).
    const pipelines = await prisma.hiringPipeline.findMany({ where: { orgId, deletedAt: null }, select: { id: true, stages: true, isDefault: true } });
    const firstStageByPipelineId = new Map(pipelines.map((p) => [p.id, stageNames(p.stages)[0] ?? "Screening"]));
    const defaultFirstStage = firstStageByPipelineId.get(pipelines.find((p) => p.isDefault)?.id ?? "") ?? "Screening";

    await Promise.all(candidates.map(async (c) => {
      if (c.isBlacklisted) return;
      const latestApp = c.applications?.[0];
      const appStatus = latestApp?.status;
      let want = appStatus ? APP_TO_CAND[appStatus] : undefined;
      if (!want && (appStatus === "AppActive" || appStatus === "AppOffered")) {
        const pipelineId = latestApp?.requisition?.pipelineId;
        const firstStage = (pipelineId && firstStageByPipelineId.get(pipelineId)) || defaultFirstStage;
        want = latestApp?.currentStage === firstStage ? "New" : "InPipeline";
      }
      if (want && c.status !== want) {
        c.status = want;
        await prisma.candidate.update({ where: { id: c.id }, data: { status: want } }).catch(() => null);
      }
    }));

    // candidateCode isn't in the generated Prisma client yet — merged in via raw SQL.
    const codeRows = candidates.length
      ? await prisma.$queryRaw<{ id: string; candidateCode: string | null }[]>`
          SELECT id, "candidateCode" FROM "app_quikhrms"."Candidate" WHERE id IN (${Prisma.join(candidates.map((c) => c.id))})`
      : [];
    const codeById = new Map(codeRows.map((r) => [r.id, r.candidateCode]));
    const withCodes = candidates.map((c) => ({ ...c, candidateCode: codeById.get(c.id) ?? null }));

    return successResponse(withCodes, paginationMeta(page, limit, total));
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
    // candidateCode isn't in the generated Prisma client yet — stamped via raw
    // SQL right after create, same pattern as assignedRecruiterId.
    const candidateCode = await generateCandidateCode(orgId);
    await prisma.$executeRaw`UPDATE "app_quikhrms"."Candidate" SET "candidateCode" = ${candidateCode} WHERE id = ${candidate.id}`;

    void fireWorkflow({
      orgId, event: "recruit.candidate.created",
      payload: { candidateId: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`, source: candidate.source },
    });

    return successResponse({ ...candidate, candidateCode }, undefined, 201);
  } catch (error) { console.error("POST /recruit/candidates error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });
