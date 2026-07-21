import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { stageNames } from "@/lib/services/pipeline-stages";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildOnHoldEmail } from "@/lib/email-templates/application-on-hold";
import { buildInterviewPassedEmail } from "@/lib/email-templates/interview-passed";
import { sendRejectionEmail } from "@/lib/recruit/rejection-mail";

/**
 * POST /api/v1/hrms/recruit/applications/:id/stage-feedback
 * Records a feedback/scorecard for the application's current stage.
 * - Creates a zero-duration Interview row for that stage if none exists.
 * - Creates a Scorecard linked to the interview.
 * - Advances application.currentStage for Hire/StrongHire, marks AppRejected for NoHire/StrongNoHire.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const overallRating = Number(body.overallRating);
    const recommendation = String(body.recommendation ?? "");
    if (!overallRating || overallRating < 1 || overallRating > 10) {
      return validationError("Rating must be between 1 and 10");
    }
    if (!["StrongHire", "Hire", "MaybeHire", "NoHire", "StrongNoHire"].includes(recommendation)) {
      return validationError("Invalid recommendation");
    }

    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!app) return notFound("Application not found");

    const pipeline = await prisma.hiringPipeline.findFirst({
      where: { orgId, deletedAt: null, isDefault: true },
    });
    const stages = stageNames(pipeline?.stages);
    const currentStage = app.currentStage ?? stages[0] ?? "Screening";
    const currentIdx = stages.indexOf(currentStage);
    const round = currentIdx >= 0 ? currentIdx + 1 : 1;

    const interviewerId = await resolveEmployeeId(orgId, userId);
    if (!interviewerId) return validationError("Interviewer employee record not found");

    // Reuse latest interview for this stage, or create a minimal one.
    let interview = await prisma.interview.findFirst({
      where: { orgId, applicationId: app.id, round, deletedAt: null },
      orderBy: { scheduledAt: "desc" },
    });
    if (!interview) {
      interview = await prisma.interview.create({
        data: {
          orgId,
          applicationId: app.id,
          round,
          type: "Video",
          interviewerId,
          scheduledAt: new Date(),
          duration: 0,
          status: "IntCompleted",
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } else {
      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: "IntCompleted", updatedBy: userId },
      });
    }

    // Scorecard now lives on the interview row; overwrite it (re-feedback allowed).
    const updatedIv = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        overallRating,
        recommendation: recommendation as "StrongHire" | "Hire" | "MaybeHire" | "NoHire" | "StrongNoHire",
        strengths: body.strengths || undefined,
        concerns: body.concerns || undefined,
        overallComments: body.overallComments || undefined,
        scorecardSubmittedAt: new Date(),
      },
    });
    const sc = {
      id: updatedIv.id, interviewId: updatedIv.id, applicationId: app.id,
      overallRating: updatedIv.overallRating, recommendation: updatedIv.recommendation,
      strengths: updatedIv.strengths, concerns: updatedIv.concerns,
      overallComments: updatedIv.overallComments, submittedAt: updatedIv.scorecardSubmittedAt,
    };

    // Apply decision
    const deferStageMove = body.deferStageMove === true;
    let stageAdvanced = false;
    if (recommendation === "Hire" || recommendation === "StrongHire") {
      if (!deferStageMove) {
        const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1
          ? stages[currentIdx + 1]
          : currentStage;
        if (nextStage && nextStage !== currentStage) {
          const history = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
          await prisma.jobApplication.update({
            where: { id: app.id },
            data: {
              currentStage: nextStage,
              // A positive recommendation clears any prior On-Hold state.
              ...(app.status === "AppOnHold" ? { status: "AppActive" } : {}),
              stageHistory: JSON.parse(JSON.stringify([
                ...history,
                { stage: nextStage, date: new Date().toISOString(), movedBy: userId, reason: `Approved at ${currentStage}` },
              ])),
              updatedBy: userId,
            },
          });
          stageAdvanced = true;
        }
      }
      // Congratulate the candidate on clearing this round — same email the
      // interview-decision path sends. Previously the pipeline "approve" path
      // advanced the candidate silently with no email. Best-effort, background.
      void (async () => {
        try {
          const [cand, company, req_] = await Promise.all([
            prisma.candidate.findFirst({ where: { id: app.candidateId, orgId }, select: { firstName: true, lastName: true, email: true } }),
            prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
            prisma.jobRequisition.findUnique({ where: { id: app.requisitionId }, select: { title: true } }),
          ]);
          if (!cand?.email) return;
          const candidateName = `${cand.firstName} ${cand.lastName}`.trim();
          const jobTitle = req_?.title ?? "the role";
          const companyName = company?.companyName ?? "Our Company";
          await resolveAndSend(orgId, {
            key: "recruit.interview-passed",
            to: cand.email,
            vars: { candidateName, jobTitle, companyName, roundName: currentStage },
            fallback: () => buildInterviewPassedEmail({ candidateName, jobTitle, companyName, roundName: currentStage }),
          });
        } catch (e) {
          console.error("[stage-feedback] cleared-round mail failed:", e);
        }
      })();
    } else if (recommendation === "MaybeHire") {
      // On Hold — park the candidate AND move them to the Archive so they drop
      // off the active pipeline board (the applications query hides archived
      // candidates). Restoring from Archive reactivates the held application.
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: { status: "AppOnHold", updatedBy: userId },
      });
      await prisma.candidate.update({
        where: { id: app.candidateId },
        data: {
          isArchived: true,
          archiveReason: body.concerns || body.overallComments || "On hold from pipeline",
          archivedAt: new Date(),
          archivedBy: userId,
        },
      }).catch(() => null);

      // Auto-notify the candidate their application is on hold (customizable in
      // Settings → Email Templates → "Application On Hold"). Best-effort.
      void (async () => {
        try {
          const [cand, company, req_] = await Promise.all([
            prisma.candidate.findFirst({ where: { id: app.candidateId, orgId }, select: { firstName: true, lastName: true, email: true } }),
            prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
            prisma.jobRequisition.findUnique({ where: { id: app.requisitionId }, select: { title: true } }),
          ]);
          if (!cand?.email) return;
          const vars = {
            candidateName: `${cand.firstName} ${cand.lastName}`.trim(),
            jobTitle: req_?.title ?? "the role",
            companyName: company?.companyName ?? "QuikIT HRMS",
          };
          await resolveAndSend(orgId, { key: "recruit.on-hold", to: cand.email, vars, fallback: () => buildOnHoldEmail(vars) });
        } catch (err) {
          console.error("[mail] on-hold email failed:", err);
        }
      })();
    } else if (recommendation === "NoHire" || recommendation === "StrongNoHire") {
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          status: "AppRejected",
          rejectionStage: currentStage,
          rejectionReason: body.concerns || body.overallComments || "Rejected via stage feedback",
          updatedBy: userId,
        },
      });
      // Cancel any upcoming interviews — a rejected candidate has none pending.
      await prisma.interview.updateMany({
        where: { orgId, applicationId: app.id, status: "IntScheduled", deletedAt: null },
        data: { status: "IntCancelled" },
      }).catch(() => null);

      // Notify the candidate (with the re-apply cooling note). Background.
      void (async () => {
        const [cand, req_] = await Promise.all([
          prisma.candidate.findUnique({ where: { id: app.candidateId }, select: { firstName: true, lastName: true, email: true } }),
          prisma.jobRequisition.findUnique({ where: { id: app.requisitionId }, select: { title: true } }),
        ]);
        if (!cand?.email) return;
        await sendRejectionEmail(orgId, {
          to: cand.email,
          candidateName: `${cand.firstName} ${cand.lastName}`.trim(),
          jobTitle: req_?.title ?? "the role",
        });
      })();
    }

    // Keep the candidate's status in sync so the Candidates list reflects the
    // pipeline decision (was previously stuck on "New").
    const candStatus: "InPipeline" | "CandOnHold" | "CandRejected" =
      recommendation === "NoHire" || recommendation === "StrongNoHire" ? "CandRejected"
        : recommendation === "MaybeHire" ? "CandOnHold"
          : "InPipeline";
    await prisma.candidate.update({
      where: { id: app.candidateId },
      data: { status: candStatus },
    }).catch(() => null);

    return successResponse({ scorecard: sc, interviewId: interview.id, stageAdvanced }, undefined, 201);
  } catch (error) {
    console.error("POST /recruit/applications/:id/stage-feedback error:", error);
    return internalError();
  }
});
