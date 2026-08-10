import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createApplicationSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { stageNames } from "@/lib/services/pipeline-stages";
import { scoreResumeAgainstJD, parsedResumeToText, type SkillWeight } from "@/lib/ai/ats-scorer";

export const GET = withServiceAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const requisitionId = searchParams.get("requisitionId");
    const status = searchParams.get("status");
    const stage = searchParams.get("stage");

    // `status` accepts a single value or a comma-separated list (e.g.
    // "AppActive,AppOffered") so the pipeline board can show candidates through
    // the whole offer lifecycle, not just AppActive.
    type AppStatus = "AppActive" | "AppHired" | "AppRejected" | "AppOnHold" | "AppWithdrawn" | "AppOffered" | "AppDeclined";
    const statuses = status ? status.split(",").map((s) => s.trim()).filter(Boolean) as AppStatus[] : [];

    const where = {
      orgId, deletedAt: null,
      // Blacklisted / archived candidates drop off the active pipeline (reversible
      // — un-archiving or lifting the blacklist brings their applications back).
      candidate: { isBlacklisted: false, isArchived: false },
      ...(requisitionId && { requisitionId }),
      ...(statuses.length === 1
        ? { status: statuses[0] }
        : statuses.length > 1
          ? { status: { in: statuses } }
          : {}),
      ...(stage && { currentStage: stage }),
    };

    const [apps, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where, orderBy: { appliedDate: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, location: true, source: true, currentCompany: true, currentDesignation: true, totalExperience: true, noticePeriod: true, currentCTC: true, expectedCTC: true, skills: true, linkedinUrl: true, portfolioUrl: true, resumeUrl: true } },
          requisition: { select: { id: true, title: true, requisitionNumber: true, pipelineId: true, interviewPanel: true, technicalQuestions: true, jobDescription: true } },
          _count: { select: { interviews: true } },
        },
      }),
      prisma.jobApplication.count({ where }),
    ]);

    const latestMap = new Map<string, { round: number; recommendation: string; submittedAt: Date }>();
    const scorecardCount = new Map<string, number>();
    const ratingSum = new Map<string, number>();
    const latestInterviewMap = new Map<string, {
      id: string; round: number; type: string; status: string;
      scheduledAt: Date; duration: number;
      location: string | null; meetingLink: string | null;
      interviewer: { id: string; firstName: string; lastName: string } | null;
    }>();
    // PostOffer document-request status per application — powers the Offer-stage
    // card's "Send Reminder" / "Docs received" states (mirrors /recruit/offers).
    const docRequestMap = new Map<string, {
      status: "Pending" | "Completed" | "Cancelled";
      lastReminderAt: Date | null; reminderCount: number | null;
    }>();
    // Per-application gate: is any requested doc not yet approved, and which ones.
    const docGateMap = new Map<string, { blocking: boolean; pending: string[] }>();
    // Offer data now lives on the JobApplication row itself (offer* columns),
    // so it's read straight off each `a` below — no separate offer query.
    if (apps.length) {
      const appIds = apps.map((a) => a.id);

      const [scorecards, interviews, docRequests, allDocReqs] = await Promise.all([
        // Scorecard data now lives on Interview itself (overallRating set = submitted).
        prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: appIds }, overallRating: { not: null } },
          orderBy: { scorecardSubmittedAt: "desc" },
          select: { applicationId: true, recommendation: true, scorecardSubmittedAt: true, round: true, overallRating: true },
        }),
        prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: appIds } },
          orderBy: { scheduledAt: "desc" },
          select: {
            id: true, applicationId: true, round: true, type: true, status: true,
            scheduledAt: true, duration: true, location: true, meetingLink: true,
            interviewer: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        prisma.candidateDocumentRequest.findMany({
          where: { orgId, applicationId: { in: appIds }, bundle: "PostOffer", deletedAt: null },
          select: { applicationId: true, status: true, lastReminderAt: true, reminderCount: true },
        }),
        // All (non-cancelled) doc requests across both bundles — powers the
        // "all requested docs must be approved before advancing" gate. A request
        // is fully approved only when its status is "Completed".
        prisma.candidateDocumentRequest.findMany({
          where: { orgId, applicationId: { in: appIds }, deletedAt: null, status: { not: "Cancelled" } },
          select: {
            applicationId: true, status: true, bundle: true,
            uploads: {
              where: { deletedAt: null },
              select: { status: true, customLabel: true, fileName: true, documentType: { select: { name: true } } },
            },
          },
        }),
      ]);

      for (const sc of scorecards) {
        scorecardCount.set(sc.applicationId, (scorecardCount.get(sc.applicationId) ?? 0) + 1);
        if (sc.overallRating != null) ratingSum.set(sc.applicationId, (ratingSum.get(sc.applicationId) ?? 0) + sc.overallRating);
        if (!latestMap.has(sc.applicationId) && sc.scorecardSubmittedAt) {
          latestMap.set(sc.applicationId, { round: sc.round, recommendation: sc.recommendation ?? "", submittedAt: sc.scorecardSubmittedAt });
        }
      }
      for (const iv of interviews) {
        if (!latestInterviewMap.has(iv.applicationId)) {
          latestInterviewMap.set(iv.applicationId, {
            id: iv.id, round: iv.round, type: iv.type, status: iv.status,
            scheduledAt: iv.scheduledAt, duration: iv.duration,
            location: iv.location, meetingLink: iv.meetingLink,
            interviewer: iv.interviewer,
          });
        }
      }
      for (const dr of docRequests) {
        docRequestMap.set(dr.applicationId, {
          status: dr.status as "Pending" | "Completed" | "Cancelled",
          lastReminderAt: dr.lastReminderAt, reminderCount: dr.reminderCount,
        });
      }
      for (const r of allDocReqs) {
        const entry = docGateMap.get(r.applicationId) ?? { blocking: false, pending: [] };
        // Only block on documents the candidate has actually UPLOADED that HR
        // hasn't approved yet (Pending review or Rejected). A bundle that's
        // merely requested with nothing uploaded must NOT block — post-offer
        // docs are collected after the offer is accepted, so requiring them
        // first would deadlock the offer.
        const awaitingReview = r.uploads.filter((u) => u.status !== "Approved");
        for (const u of awaitingReview) {
          entry.blocking = true;
          const name = u.documentType?.name ?? u.customLabel ?? u.fileName ?? "Document";
          entry.pending.push(u.status === "Rejected" ? `${name} (rejected — awaiting re-upload)` : `${name} (awaiting your review)`);
        }
        docGateMap.set(r.applicationId, entry);
      }
    }
    const enriched = apps.map((a) => ({
      ...a,
      _count: { ...a._count, scorecards: scorecardCount.get(a.id) ?? 0 },
      avgRating: (scorecardCount.get(a.id) ?? 0) > 0
        ? Math.round((ratingSum.get(a.id) ?? 0) / (scorecardCount.get(a.id) ?? 1) * 10) / 10
        : null,
      latestScorecard: latestMap.get(a.id) ?? null,
      latestInterview: latestInterviewMap.get(a.id) ?? null,
      latestOffer: a.offerStatus != null
        ? {
            id: a.id, status: a.offerStatus, designation: a.offerDesignation,
            offeredCTC: a.offeredCTC, joiningDate: a.offerJoiningDate,
            sentAt: a.offerSentAt, respondedAt: a.offerRespondedAt,
            expiresAt: a.offerExpiresAt,
          }
        : null,
      docRequest: docRequestMap.get(a.id) ?? null,
      docGate: docGateMap.get(a.id) ?? null,
    }));

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/applications error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { candidateId, requisitionId, currentStage } = parsed.data;

    const candidateCheck = await prisma.candidate.findFirst({
      where: { id: candidateId, orgId, deletedAt: null },
      select: { id: true, isBlacklisted: true, blacklistReason: true, blacklistedUntil: true, isArchived: true, firstName: true, lastName: true },
    });
    if (!candidateCheck) return validationError("Candidate not found");
    if (candidateCheck.isBlacklisted) {
      const until = candidateCheck.blacklistedUntil ? new Date(candidateCheck.blacklistedUntil) : null;
      const stillActive = !until || until.getTime() > Date.now();
      if (stillActive) {
        return conflict(
          `${candidateCheck.firstName} ${candidateCheck.lastName} is blacklisted${candidateCheck.blacklistReason ? ` — ${candidateCheck.blacklistReason}` : ""}${until ? ` (until ${until.toLocaleDateString()})` : ""}. Lift blacklist before creating an application.`,
        );
      }
    }
    if (candidateCheck.isArchived) {
      return conflict(`${candidateCheck.firstName} ${candidateCheck.lastName} is archived. Restore from archive before creating an application.`);
    }

    // Re-apply cooling period (Company Settings). Applies to ANY role — once a
    // candidate is rejected, they can't be applied to any requisition until the
    // cooling window passes (measured from their most recent rejection).
    const company = await prisma.companySettings.findUnique({
      where: { orgId }, select: { candidateCoolingMonths: true },
    });
    const coolMonths = company?.candidateCoolingMonths ?? 0;
    if (coolMonths > 0) {
      const lastRejected = await prisma.jobApplication.findFirst({
        where: {
          orgId, candidateId, deletedAt: null,
          status: { in: ["AppRejected", "AppDeclined"] },
          // Penalty-free rejections (requisition cancelled / not selected after a
          // hold-resume) don't lock the candidate out of other roles.
          rejectionExempt: false,
        },
        orderBy: [{ rejectedAt: "desc" }, { updatedAt: "desc" }],
        select: { rejectedAt: true, updatedAt: true, requisition: { select: { title: true } } },
      });
      if (lastRejected) {
        // Count from the stable rejection time; fall back to updatedAt for rows
        // rejected before rejectedAt existed.
        // Add whole months, clamped to the target month's last day so a
        // month-end rejection (e.g. Jan 31 + 1mo) lands on Feb 28/29, not Mar 3.
        const rejectedDate = new Date(lastRejected.rejectedAt ?? lastRejected.updatedAt);
        const rejDay = rejectedDate.getDate();
        const eligibleAt = new Date(rejectedDate);
        eligibleAt.setDate(1);
        eligibleAt.setMonth(eligibleAt.getMonth() + coolMonths);
        const lastDayOfTarget = new Date(eligibleAt.getFullYear(), eligibleAt.getMonth() + 1, 0).getDate();
        eligibleAt.setDate(Math.min(rejDay, lastDayOfTarget));
        if (Date.now() < eligibleAt.getTime()) {
          const when = eligibleAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const forRole = lastRejected.requisition?.title ? ` for "${lastRejected.requisition.title}"` : "";
          return conflict(`${candidateCheck.firstName} ${candidateCheck.lastName} was rejected${forRole} and is in a cooling period. They cannot apply to any role until ${when} (cooling period: ${coolMonths} month${coolMonths > 1 ? "s" : ""}).`);
        }
      }
    }

    const existing = await prisma.jobApplication.findFirst({
      // Include soft-deleted: the (orgId, candidateId, requisitionId) unique
      // constraint spans deleted rows too, so we must find a deleted match and
      // REVIVE it — otherwise create() hits a DB unique error → generic 500.
      where: { orgId, candidateId, requisitionId },
    });
    if (existing && !existing.deletedAt) return conflict("Application already exists for this candidate-requisition pair");

    // Pick pipeline from requisition; fallback to default pipeline.
    const req_ = await prisma.jobRequisition.findFirst({
      where: { id: requisitionId, orgId, deletedAt: null },
      select: { pipelineId: true },
    });
    // Guard the FK: an invalid/cross-org requisition would otherwise throw a
    // Prisma FK error on create → generic "Something went wrong".
    if (!req_) return validationError("Requisition not found");
    const pipeline = await prisma.hiringPipeline.findFirst({
      where: {
        orgId, deletedAt: null,
        ...(req_?.pipelineId ? { id: req_.pipelineId } : { isDefault: true }),
      },
      select: { stages: true },
    });
    const stages = stageNames(pipeline?.stages);
    const firstStage = stages[0] ?? "Screening";
    // Only honor a requested stage if it's actually part of this requisition's
    // pipeline — otherwise silently fall back to the first stage rather than
    // writing a currentStage that never appears on the pipeline board.
    const initialStage = (currentStage && stages.includes(currentStage)) ? currentStage : firstStage;

    const freshHistory = JSON.parse(JSON.stringify([{ stage: initialStage, date: new Date().toISOString(), movedBy: userId }]));
    const app = existing
      ? // Revive the previously-deleted application as a fresh one.
        await prisma.jobApplication.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            status: "AppActive",
            currentStage: initialStage,
            appliedDate: new Date(),
            rejectionReason: null, rejectionStage: null, rejectionExempt: false,
            stageHistory: freshHistory,
            updatedBy: userId,
          },
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            requisition: { select: { id: true, title: true } },
          },
        })
      : await prisma.jobApplication.create({
          data: {
            orgId, candidateId, requisitionId,
            currentStage: initialStage,
            stageHistory: freshHistory,
            createdBy: userId, updatedBy: userId,
          },
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            requisition: { select: { id: true, title: true } },
          },
        });

    // Update candidate status
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "InPipeline" } });

    void fireWorkflow({
      orgId, event: "recruit.application.received",
      payload: { applicationId: app.id, candidateId, requisitionId, stage: initialStage },
    });

    // Fire-and-forget ATS scoring when requisition has skill weights
    void (async () => {
      try {
        const [reqFull, candFull] = await Promise.all([
          prisma.jobRequisition.findFirst({
            where: { id: requisitionId, orgId, deletedAt: null },
            select: { title: true, jobDescription: true, experienceMin: true, experienceMax: true, skillWeights: true },
          }),
          prisma.candidate.findFirst({
            where: { id: candidateId, orgId, deletedAt: null },
            select: {
              parsedResume: true, totalExperience: true, skills: true,
              firstName: true, lastName: true, currentCompany: true, currentDesignation: true,
              education: true, location: true, linkedinUrl: true,
            },
          }),
        ]);
        const weights: SkillWeight[] = Array.isArray(reqFull?.skillWeights)
          ? (reqFull!.skillWeights as unknown[]).filter((x): x is SkillWeight =>
              typeof x === "object" && x !== null && "skill" in (x as Record<string, unknown>) && "weight" in (x as Record<string, unknown>)
            )
          : [];
        if (!reqFull || !candFull || weights.length === 0) return;
        if (!process.env.OPENROUTER_API_KEY) return;

        const parsed = (candFull.parsedResume ?? null) as Record<string, unknown> | null;
        const candidateSkills = Array.isArray(candFull.skills)
          ? (candFull.skills as unknown[]).map(String)
          : Array.isArray(parsed?.skills) ? (parsed!.skills as unknown[]).map(String) : [];

        const candExpMonths = candFull.totalExperience
          ? Number(candFull.totalExperience) * 12
          : typeof parsed?.totalExperienceMonths === "number" ? (parsed!.totalExperienceMonths as number) : null;

        // Build resumeText — prefer parsedResume, else synthesize from candidate scalar fields
        let resumeText = parsedResumeToText(parsed);
        if (!resumeText) {
          const lines: string[] = [
            `Name: ${candFull.firstName} ${candFull.lastName}`,
            candFull.currentDesignation ? `Current Role: ${candFull.currentDesignation}${candFull.currentCompany ? ` at ${candFull.currentCompany}` : ""}` : "",
            candExpMonths ? `Experience: ${(candExpMonths / 12).toFixed(1)} years` : "",
            candidateSkills.length ? `Skills: ${candidateSkills.join(", ")}` : "",
            Array.isArray(candFull.education) ? `Education: ${JSON.stringify(candFull.education)}` : "",
            candFull.location ? `Location: ${candFull.location}` : "",
          ].filter(Boolean);
          resumeText = lines.join("\n");
        }
        if (!resumeText) return;

        const result = await scoreResumeAgainstJD({
          jobTitle: reqFull.title,
          jobDescription: reqFull.jobDescription ?? null,
          experienceMin: reqFull.experienceMin != null ? Number(reqFull.experienceMin) : null,
          experienceMax: reqFull.experienceMax != null ? Number(reqFull.experienceMax) : null,
          skillWeights: weights,
          resumeText,
          candidateSummary: typeof parsed?.summary === "string" ? parsed.summary : null,
          candidateExperienceMonths: candExpMonths,
          candidateSkills,
        });

        await prisma.jobApplication.update({
          where: { id: app.id },
          data: {
            aiMatchScore: result.overallScore,
            aiMatchAnalysis: JSON.parse(JSON.stringify(result)),
          },
        });
      } catch (e) {
        console.error("ATS auto-score failed for application", app.id, e);
      }
    })();

    // Soft warning (non-blocking): candidate was recently rejected for a
    // DIFFERENT role. Surfaced to the recruiter so they're aware, but the
    // application still goes through.
    let warning: string | undefined;
    try {
      const lookback = new Date();
      lookback.setMonth(lookback.getMonth() - 6);
      const priorReject = await prisma.jobApplication.findFirst({
        where: {
          orgId, candidateId, deletedAt: null, id: { not: app.id },
          status: { in: ["AppRejected", "AppDeclined"] },
          rejectionExempt: false,
          updatedAt: { gte: lookback },
          requisition: { is: { title: { not: app.requisition?.title ?? "" } } },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true, requisition: { select: { title: true } } },
      });
      if (priorReject) {
        const when = priorReject.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        warning = `Heads up: this candidate was rejected for "${priorReject.requisition?.title ?? "another role"}" on ${when}.`;
      }
    } catch { /* warning is best-effort */ }

    return successResponse({ ...app, warning }, undefined, 201);
  } catch (error) { console.error("POST /recruit/applications error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });
