import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, conflict } from "@/lib/api-response";
import { updateApplicationSchema } from "@/lib/validations/recruit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveAndSend } from "@/lib/email/resolve";
import { sendRejectionEmail } from "@/lib/recruit/rejection-mail";
import { buildInterviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { buildOfferEmail } from "@/lib/email-templates/offer";
import { triggerCandidateDocBundle } from "@/lib/services/candidate-doc-service";
import { buildOfferDefaultEmail } from "@/lib/email-templates/offer-default";
import { generateOfferPdf } from "@/lib/services/offer-pdf";
import { getStageConfig, stageNames } from "@/lib/services/pipeline-stages";
import { whereEmployeeHasAnyRole } from "@/lib/rbac/queries";
import { publishNotification } from "@/lib/services/realtime";
import { offerSelect, offerFromApplication } from "@/lib/recruit/offer-shape";
type MailFiredResult = { template: string; to?: string; skipped?: string } | null;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

async function fireStageMail(
  orgId: string,
  userId: string,
  applicationId: string,
  newStage: string,
): Promise<MailFiredResult> {
  // Fetch application (with pipelineId + candidate + requisition) and companySettings in parallel.
  // Uses cache for companySettings (rarely changes).
  const [app, company] = await Promise.all([
    prisma.jobApplication.findFirst({
      where: { id: applicationId, orgId, deletedAt: null },
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true, location: true } },
        requisition: { select: { title: true, pipelineId: true } },
      },
    }),
    prisma.companySettings.findUnique({ where: { orgId } }),
  ]);

  if (!app) return null;

  const pipelineId = app.requisition?.pipelineId ?? null;
  const pipeline = await prisma.hiringPipeline.findFirst({
    where: {
      orgId, deletedAt: null,
      ...(pipelineId ? { id: pipelineId } : { isDefault: true }),
    },
  });
  if (!pipeline) return null;

  const stageCfg = getStageConfig(pipeline.stages, newStage);
  if (!stageCfg || !stageCfg.sendMail || !stageCfg.mailTemplate) return null;

  const template = stageCfg.mailTemplate;

  if (!app.candidate?.email) return { template, skipped: "Candidate email missing" };
  const companyName = company?.companyName ?? "Our Company";
  const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();
  const jobTitle = app.requisition?.title ?? "the role";

  if (template === "interview") {
    const interview = await prisma.interview.findFirst({
      where: { orgId, applicationId, deletedAt: null, status: "IntScheduled" },
      orderBy: { scheduledAt: "desc" },
      include: { interviewer: { select: { firstName: true, lastName: true } } },
    });
    if (!interview) return { template, skipped: "No scheduled interview. Schedule one from Interviews page." };
    const dt = new Date(interview.scheduledAt);
    const inviteData = {
      candidateName,
      jobTitle,
      interviewDate: dt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
      interviewTime: dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      duration: String(interview.duration),
      interviewerName: `${interview.interviewer.firstName} ${interview.interviewer.lastName}`.trim(),
      type: interview.type,
      meetingLink: interview.meetingLink,
      location: interview.location,
      companyName,
    };
    await resolveAndSend(orgId, {
      key: "recruit.interview-invite",
      to: app.candidate.email,
      vars: { ...inviteData, meetingLink: inviteData.meetingLink ?? "", location: inviteData.location ?? "" },
      fallback: () => buildInterviewInviteEmail(inviteData),
    });
    return { template, to: app.candidate.email };
  }

  if (template === "offer-branded" || template === "offer-default") {
    const offerApp = await prisma.jobApplication.findFirst({
      where: { id: applicationId, orgId, deletedAt: null, offerStatus: { not: null } },
      select: offerSelect,
    });
    const offer = offerApp ? offerFromApplication(offerApp) : null;
    if (!offer) return { template, skipped: "No offer record. Create one on Offers page first." };

    const [department, manager] = await Promise.all([
      offer.departmentId
        ? prisma.department.findFirst({ where: { id: offer.departmentId, orgId }, select: { name: true } })
        : Promise.resolve(null),
      offer.reportingToId
        ? prisma.employee.findFirst({
            where: { id: offer.reportingToId, orgId },
            select: { firstName: true, lastName: true, jobTitle: true },
          })
        : Promise.resolve(null),
    ]);

    if (template === "offer-branded") {
      const hasBranding = !!(company?.letterheadKey || company?.signatureKey || company?.sealKey || company?.signatoryName);
      if (!hasBranding) {
        return { template, skipped: "Branding template not set. Go to Settings → Branding and upload letterhead / signature before enabling branded PDF." };
      }
      const candidateAddress = app.candidate.location ?? null;

      const pdfBuffer = await generateOfferPdf({
        candidateName,
        candidateAddress,
        jobTitle,
        designation: offer.designation ?? "",
        offeredCTC: Number(offer.offeredCTC),
        joiningDate: fmtDate(offer.joiningDate),
        joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
        relocationBonus: offer.relocationBonus ? Number(offer.relocationBonus) : null,
        equityGrant: offer.equityGrant,
        expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
        department: department?.name ?? null,
        reportingTo: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
        companyName,
        companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state].filter(Boolean).join(", ") || null,
        letterDate: fmtDate(new Date()),
        letterheadKey: company?.letterheadKey ?? null,
        sealKey: company?.sealKey ?? null,
        signatureKey: company?.signatureKey ?? null,
        signatoryName: company?.signatoryName ?? null,
        signatoryDesignation: company?.signatoryDesignation ?? null,
        footer: company?.offerLetterFooter ?? null,
      });
      const offerData = {
        candidateName,
        jobTitle,
        designation: offer.designation ?? "",
        offeredCTC: Number(offer.offeredCTC),
        joiningDate: fmtDate(offer.joiningDate),
        joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
        expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
        companyName,
      };
      const pdfName = `Offer-${app.candidate.firstName}-${app.candidate.lastName}.pdf`.replace(/\s+/g, "");
      await resolveAndSend(orgId, {
        key: "recruit.offer-branded",
        to: app.candidate.email,
        vars: {
          candidateName, jobTitle,
          designation: offerData.designation,
          offeredCTC: `₹${Number(offer.offeredCTC).toLocaleString("en-IN")}`,
          joiningDate: offerData.joiningDate,
          joiningBonus: offer.joiningBonus ? `₹${Number(offer.joiningBonus).toLocaleString("en-IN")}` : "",
          expiresAt: offerData.expiresAt ?? "",
          companyName,
        },
        fallback: () => buildOfferEmail(offerData),
        attachments: [{ filename: pdfName, content: pdfBuffer, contentType: "application/pdf" }],
      });
      await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { offerStatus: "OfferSent", offerSentAt: new Date(), updatedBy: userId },
      });
      return { template, to: app.candidate.email };
    }

    // offer-default: content-only letter, no PDF
    const offerDefaultData = {
      candidateName,
      jobTitle,
      designation: offer.designation ?? "",
      offeredCTC: Number(offer.offeredCTC),
      joiningDate: fmtDate(offer.joiningDate),
      joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
      expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
      department: department?.name ?? null,
      reportingTo: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
      companyName,
      companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state].filter(Boolean).join(", ") || null,
      signatoryName: company?.signatoryName ?? null,
      signatoryDesignation: company?.signatoryDesignation ?? null,
      letterDate: fmtDate(new Date()),
    };
    await resolveAndSend(orgId, {
      key: "recruit.offer-default",
      to: app.candidate.email,
      vars: {
        candidateName, jobTitle,
        designation: offerDefaultData.designation,
        offeredCTC: `₹${Number(offer.offeredCTC).toLocaleString("en-IN")}`,
        joiningDate: offerDefaultData.joiningDate,
        joiningBonus: offer.joiningBonus ? `₹${Number(offer.joiningBonus).toLocaleString("en-IN")}` : "",
        expiresAt: offerDefaultData.expiresAt ?? "",
        department: offerDefaultData.department ?? "",
        reportingTo: offerDefaultData.reportingTo ?? "",
        companyAddress: offerDefaultData.companyAddress ?? "",
        signatoryName: offerDefaultData.signatoryName ?? "",
        signatoryDesignation: offerDefaultData.signatoryDesignation ?? "",
        letterDate: offerDefaultData.letterDate,
        companyName,
      },
      fallback: () => buildOfferDefaultEmail(offerDefaultData),
    });
    await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { offerStatus: "OfferSent", offerSentAt: new Date(), updatedBy: userId },
    });
    return { template, to: app.candidate.email };
  }

  // Joining letter is no longer emailed from recruitment. It's a PDF template
  // generated from the onboarding page (see /onboarding/[id]/joining-letter).
  if (template === "joining-letter") {
    return { template, skipped: "Joining letter is now a PDF — open it from the onboarding page." };
  }

  if (template === "welcome") {
    return { template, skipped: "Welcome mail fires from onboarding flow — not from pipeline stage change." };
  }

  return null;
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        candidate: true,
        requisition: { select: { id: true, title: true, requisitionNumber: true, department: { select: { name: true } } } },
        interviews: { include: { interviewer: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { round: "asc" } },
      },
    });
    if (!app) return notFound("Application not found");
    // Scorecard fields live on the interview row and offer fields on the
    // application row; re-expose both under their historical shapes so existing
    // consumers keep working.
    return successResponse({
      ...app,
      offer: offerFromApplication(app),
      interviews: app.interviews.map((iv) => ({
        ...iv,
        scorecard: iv.overallRating != null
          ? {
              id: iv.id, interviewId: iv.id, applicationId: iv.applicationId,
              overallRating: iv.overallRating, recommendation: iv.recommendation,
              criteria: iv.criteria, strengths: iv.strengths, concerns: iv.concerns,
              overallComments: iv.overallComments, submittedAt: iv.scorecardSubmittedAt,
            }
          : null,
      })),
    });
  } catch (error) { console.error("GET /recruit/applications/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { requisition: { select: { pipelineId: true } } },
    });
    if (!existing) return notFound("Application not found");
    const body = await req.json();
    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedBy: userId };

    if (data.currentStage && data.currentStage !== existing.currentStage && existing.currentStage) {
      const pipelineId = existing.requisition?.pipelineId ?? null;
      const pipelineForStages = await prisma.hiringPipeline.findFirst({
        where: {
          orgId, deletedAt: null,
          ...(pipelineId ? { id: pipelineId } : { isDefault: true }),
        },
      });
      const names = stageNames(pipelineForStages?.stages);
      const fromIdx = names.indexOf(existing.currentStage);
      const toIdx = names.indexOf(data.currentStage);
      // Block forward stage SKIPS — advance one stage at a time so each round's
      // feedback gate (below) is actually enforced. Backward moves are allowed.
      if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx + 1) {
        return conflict(
          `Can't skip stages — move one stage at a time from "${existing.currentStage}" and clear each round's feedback.`,
        );
      }
      if (fromIdx >= 0) {
        const round = fromIdx + 1;
        const scorecardCount = await prisma.interview.count({
          where: {
            orgId,
            applicationId: params.id,
            round,
            deletedAt: null,
            overallRating: { not: null },
          },
        });
        if (scorecardCount === 0) {
          return conflict(
            `Feedback required for "${existing.currentStage}" before moving to another stage. Submit stage feedback first.`,
          );
        }
      }
    }

    if (data.currentStage) {
      updateData.currentStage = data.currentStage;
      const history = (existing.stageHistory as Array<unknown>) ?? [];
      history.push({ stage: data.currentStage, date: new Date().toISOString(), movedBy: userId, ...(data.moveReason ? { reason: data.moveReason } : {}) });
      updateData.stageHistory = JSON.parse(JSON.stringify(history));
      // Advancing an On-Hold candidate clears the hold (unless this same
      // request explicitly sets another status like Rejected/Hired).
      if (existing.status === "AppOnHold" && !data.status) {
        updateData.status = "AppActive";
      }
      // Moving through stages means the candidate is actively in the pipeline
      // (a terminal status set below in this same request will override this).
      await prisma.candidate.update({
        where: { id: existing.candidateId },
        data: { status: "InPipeline" },
      }).catch(() => null);
    }
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "AppRejected") {
        updateData.rejectionReason = data.rejectionReason;
        updateData.rejectionStage = existing.currentStage;
        // Stamp a stable rejection time so the re-apply cooling window counts
        // from the actual rejection (not from later edits to updatedAt).
        if (existing.status !== "AppRejected") updateData.rejectedAt = new Date();
        // Reflect the rejection on the candidate so the Candidates list stops
        // showing them as "In Pipeline" and they can be filtered as Rejected.
        await prisma.candidate.update({
          where: { id: existing.candidateId },
          data: { status: "CandRejected" },
        }).catch(() => null);
        // Cancel any upcoming interviews — a rejected candidate has none pending.
        await prisma.interview.updateMany({
          where: { orgId, applicationId: existing.id, status: "IntScheduled", deletedAt: null },
          data: { status: "IntCancelled" },
        }).catch(() => null);
      }
      if (data.status === "AppHired") {
        // Stable hire timestamp — distinct from updatedAt, which any later
        // unrelated edit (e.g. fixing a typo'd phone number) would otherwise
        // move, silently corrupting Time-to-Hire / "hires this month".
        if (existing.status !== "AppHired") updateData.hiredAt = new Date();
        // Atomic headcount claim: increment ONLY if a seat is still open, in a
        // single conditional UPDATE. Prevents two simultaneous hires from both
        // passing a separate "is it full?" check and overfilling the req.
        const claimed = await prisma.$executeRaw`
          UPDATE app_quikhrms."JobRequisition"
          SET "filledPositions" = "filledPositions" + 1, "updatedBy" = ${userId}
          WHERE id = ${existing.requisitionId} AND "orgId" = ${orgId}
            AND "deletedAt" IS NULL AND "filledPositions" < "positions"`;
        if (claimed === 0) {
          return conflict("All positions for this requisition are already filled.");
        }
        await prisma.candidate.update({ where: { id: existing.candidateId }, data: { status: "Hired" } }).catch(() => null);
      }
      // Un-hire → free the seat. A previously-hired candidate who is now
      // rejected/declined/withdrawn rolls filledPositions back and reopens the
      // requisition if it had been auto-closed by being fully filled.
      if (existing.status === "AppHired" && ["AppRejected", "AppDeclined", "AppWithdrawn"].includes(data.status)) {
        updateData.hiredAt = null;
        const reqRow = await prisma.jobRequisition.findFirst({
          where: { id: existing.requisitionId, orgId, deletedAt: null },
          select: { filledPositions: true, status: true },
        });
        if (reqRow) {
          await prisma.jobRequisition.update({
            where: { id: existing.requisitionId },
            data: {
              filledPositions: Math.max((reqRow.filledPositions ?? 0) - 1, 0),
              ...(reqRow.status === "ReqClosed" ? { status: "ReqOpen" } : {}),
              updatedBy: userId,
            },
          });
        }
      }
    }

    const app = await prisma.jobApplication.update({ where: { id: params.id }, data: updateData });

    const stageChanged = data.currentStage && data.currentStage !== existing.currentStage;

    // ── Auto-stub on stage entry ────────────────────────────────────
    // Moving a candidate to "Offer" auto-creates an OfferDetail (Draft) so it
    // appears in /recruit/offers. Moving to "Interview" auto-creates an
    // Interview stub (placeholder values HR replaces). Both are idempotent
    // and best-effort — failure here doesn't block the stage update.
    if (stageChanged && data.currentStage) {
      const stage = data.currentStage.toLowerCase();

      if (stage.startsWith("offer")) {
        try {
          const has = await prisma.jobApplication.findFirst({
            where: { id: app.id, offerStatus: { not: null } },
            select: { id: true },
          });
          if (!has) {
            const reqn = await prisma.jobRequisition.findUnique({
              where: { id: existing.requisitionId },
              select: { title: true, departmentId: true, salaryMax: true, salaryMin: true },
            });
            await prisma.jobApplication.update({
              where: { id: app.id },
              data: {
                offerStatus: "OfferDraft",
                offerDesignation: reqn?.title ?? "TBD",
                offerDepartmentId: reqn?.departmentId ?? null,
                offeredCTC: reqn?.salaryMax ?? reqn?.salaryMin ?? 0,
                offerJoiningDate: new Date(Date.now() + 30 * 86_400_000), // +30 days placeholder
                offerCreatedAt: new Date(),
                offerCreatedBy: userId,
                updatedBy: userId,
              },
            });
          }
        } catch (e) {
          console.error("[stage→Offer] auto-stub failed:", e);
        }
      }

      if (stage.startsWith("interview")) {
        try {
          // Skip if there's already an open interview to avoid clutter.
          const hasOpen = await prisma.interview.findFirst({
            where: { applicationId: app.id, deletedAt: null, status: "IntScheduled" },
            select: { id: true },
          });
          if (!hasOpen) {
            const roundCount = await prisma.interview.count({
              where: { applicationId: app.id, deletedAt: null },
            });
            // Interviewer must be a real Employee — use the HR user moving the
            // stage as a placeholder; HR replaces it in the Schedule modal.
            const resolved = await prisma.employee.findFirst({
              where: { orgId, deletedAt: null, OR: [{ id: userId }, { employeeCode: "QK-EMP-0001" }] },
              select: { id: true },
            });
            if (resolved) {
              await prisma.interview.create({
                data: {
                  orgId,
                  applicationId: app.id,
                  round: roundCount + 1,
                  type: "Video",
                  interviewerId: resolved.id,
                  scheduledAt: new Date(Date.now() + 24 * 3_600_000), // +24h placeholder
                  duration: 60,
                  status: "IntScheduled",
                  createdBy: userId,
                  updatedBy: userId,
                },
              });
            }
          }
        } catch (e) {
          console.error("[stage→Interview] auto-stub failed:", e);
        }
      }
    }

    if (stageChanged) {
      void fireWorkflow({
        orgId, event: "recruit.application.status.changed",
        payload: { applicationId: app.id, candidateId: existing.candidateId, from: existing.currentStage, to: data.currentStage },
      });

      // Notify HR admins about stage transition in real-time
      prisma.employee.findMany({
        where: { orgId, deletedAt: null, ...whereEmployeeHasAnyRole(["admin"]) },
        select: { id: true },
      }).then((admins) => {
        const ids = admins.map((a) => a.id).filter((id) => id !== userId);
        if (ids.length > 0) {
          publishNotification(orgId, ids, {
            title: "Candidate stage updated",
            message: `Application moved to "${data.currentStage}" stage.`,
            type: "Info",
            link: `/recruit/candidates`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    let mailFired: MailFiredResult = null;
    if (stageChanged && data.currentStage) {
      // Send the stage-change email in the BACKGROUND so a slow SMTP server can't
      // make this request hit the client's 20s timeout ("Request timed out after
      // 20000ms") — the move itself already succeeded.
      const stageForMail = data.currentStage;
      void fireStageMail(orgId, userId, app.id, stageForMail).catch((err) => {
        console.error("[mail] stage-change mail failed:", err);
      });
      mailFired = { template: "queued" };

      // Auto-trigger candidate document bundles on stage transitions
      // Pre-offer: fired when stage name matches /offer/i (e.g. "Offer") BUT not final-offer-stage
      // Post-offer: fired when stage name matches /hired|preJoining|joining/i
      void (async () => {
        try {
          const stage = (data.currentStage ?? "").toLowerCase();
          const isOfferStage = /offer/.test(stage) && !/post/.test(stage);
          const isJoiningStage = /hired|prejoining|joining/.test(stage);
          if (isOfferStage) {
            await triggerCandidateDocBundle(orgId, app.id, "PreOffer", userId);
          } else if (isJoiningStage) {
            await triggerCandidateDocBundle(orgId, app.id, "PostOffer", userId);
          }
        } catch (err) {
          console.error("[doc-bundle] auto-trigger failed:", err);
        }
      })();
    }

    if (data.status === "AppHired" && existing.status !== "AppHired") {
      void (async () => {
        try { await triggerCandidateDocBundle(orgId, app.id, "PostOffer", userId); }
        catch (err) { console.error("[doc-bundle] post-offer trigger on hire failed:", err); }
      })();
    }

    if (data.status === "AppRejected" && existing.status !== "AppRejected") {
      void (async () => {
        const [candidate, requisition] = await Promise.all([
          prisma.candidate.findUnique({
            where: { id: existing.candidateId },
            select: { firstName: true, lastName: true, email: true },
          }),
          prisma.jobRequisition.findUnique({
            where: { id: existing.requisitionId },
            select: { title: true },
          }),
        ]);
        if (!candidate?.email) return;
        await sendRejectionEmail(orgId, {
          to: candidate.email,
          candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(),
          jobTitle: requisition?.title ?? "the role",
        });
      })();
    }

    return successResponse({ ...app, mailFired });
  } catch (error) { console.error("PATCH /recruit/applications/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });
