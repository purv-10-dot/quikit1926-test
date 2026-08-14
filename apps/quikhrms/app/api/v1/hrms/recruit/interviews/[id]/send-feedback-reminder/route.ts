import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, errorResponse, internalError } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInterviewFeedbackRequestEmail } from "@/lib/email-templates/interview-feedback-request";
import { generateFeedbackToken } from "@/lib/services/feedback-token";
import { stageNames } from "@/lib/services/pipeline-stages";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * POST /api/v1/hrms/recruit/interviews/[id]/send-feedback-reminder
 * Manual reminder trigger from UI. Resends feedback-request email to interviewer.
 * If no feedbackToken exists yet (e.g. cron trigger hasn't run), generates one.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const iv = await prisma.interview.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true } },
            requisition: { select: { title: true, pipelineId: true } },
          },
        },
      },
    });
    if (!iv) return notFound("Interview not found");
    if (iv.overallRating != null) return errorResponse(ErrorCode.CONFLICT, "Feedback already submitted", 400);
    if (!iv.interviewer.workEmail) return errorResponse(ErrorCode.VALIDATION_ERROR, "Interviewer has no work email", 400);

    const now = new Date();

    // Rate-limit: min 1h between manual reminders
    if (iv.lastReminderAt && now.getTime() - iv.lastReminderAt.getTime() < 3600_000) {
      return errorResponse(ErrorCode.CONFLICT, "Reminder already sent recently. Try again in 1 hour.", 429);
    }

    let token = iv.feedbackToken;
    let expiresAt = iv.feedbackTokenExpiresAt;
    const needsNewToken = !token || !expiresAt || expiresAt.getTime() < now.getTime();
    if (needsNewToken) {
      const gen = generateFeedbackToken(iv.id, orgId);
      token = gen.token;
      expiresAt = gen.expiresAt;
    }

    const base = appBaseUrl();

    const pipeline = iv.application?.requisition?.pipelineId
      ? await prisma.hiringPipeline.findFirst({ where: { id: iv.application.requisition.pipelineId, orgId } })
      : await prisma.hiringPipeline.findFirst({ where: { orgId, isDefault: true } });
    const stages = stageNames(pipeline?.stages);
    const roundName = stages[iv.round - 1] ?? `Round ${iv.round}`;

    const company = await prisma.companySettings.findUnique({
      where: { orgId }, select: { companyName: true },
    });

    const level = ((iv.reminderCount ?? 0) + 1) as 1 | 2 | 3;
    const cappedLevel = (level > 3 ? 3 : level) as 1 | 2 | 3;

    const fbData = {
      interviewerName: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(),
      candidateName: `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim(),
      jobTitle: iv.application.requisition.title,
      interviewDate: iv.scheduledAt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
      interviewTime: iv.scheduledAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      duration: String(iv.duration),
      type: iv.type,
      roundName: roundName.replace(/([A-Z])/g, " $1").trim(),
      feedbackUrl: `${base}/interview-feedback/${token}`,
      expiryDays: 7,
      companyName: company?.companyName ?? "Our Company",
      isReminder: true,
      reminderLevel: cappedLevel,
    };

    const r = await resolveAndSend(orgId, {
      key: "interview.feedback-reminder",
      to: iv.interviewer.workEmail,
      vars: { ...fbData, reminderLevel: cappedLevel },
      fallback: () => buildInterviewFeedbackRequestEmail(fbData),
    });
    if (!r.sent) return errorResponse(ErrorCode.INTERNAL_ERROR, r.error || "Mail send failed", 500);

    await prisma.interview.update({
      where: { id: iv.id },
      data: {
        ...(needsNewToken && { feedbackToken: token, feedbackTokenExpiresAt: expiresAt }),
        ...(!iv.feedbackRequestSentAt && { feedbackRequestSentAt: now }),
        reminderCount: cappedLevel,
        lastReminderAt: now,
      },
    });

    return successResponse({ sent: true, to: iv.interviewer.workEmail, reminderLevel: cappedLevel });
  } catch (error) {
    console.error("POST /recruit/interviews/:id/send-feedback-reminder error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
