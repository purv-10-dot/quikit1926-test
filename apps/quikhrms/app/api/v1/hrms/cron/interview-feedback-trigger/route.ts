import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { generateFeedbackToken } from "@/lib/services/feedback-token";
import { buildInterviewFeedbackRequestEmail } from "@/lib/email-templates/interview-feedback-request";
import { stageNames } from "@/lib/services/pipeline-stages";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * POST /api/v1/hrms/cron/interview-feedback-trigger
 * Self-hosted cron endpoint. Call every 15 min.
 * Auth: header `x-cron-secret: $CRON_SECRET`
 *
 * Finds interviews whose (scheduledAt + duration) has passed, are still IntScheduled,
 * and have never received a feedback-request mail. Flips to IntCompleted,
 * generates a signed feedback token (7-day expiry), and emails the interviewer.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  const header = req.headers.get("x-cron-secret");
  if (header !== secret) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const base = appBaseUrl();
  const candidates = await prisma.interview.findMany({
    where: {
      deletedAt: null,
      status: "IntScheduled",
      feedbackRequestSentAt: null,
    },
    include: {
      interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          requisition: { select: { title: true, pipelineId: true } },
        },
      },
    },
    take: 200,
  });

  let processed = 0, mailed = 0, skippedNoEmail = 0, failed = 0;
  const errors: string[] = [];

  for (const iv of candidates) {
    const end = new Date(iv.scheduledAt.getTime() + iv.duration * 60_000);
    if (end.getTime() > now.getTime()) continue;
    processed++;

    try {
      // Reuse the token minted at invite time (kept on the interview) so the
      // "Submit Feedback" link in the assignment email stays valid; only mint a
      // fresh one if it's missing or already expired.
      let token = iv.feedbackToken;
      let expiresAt = iv.feedbackTokenExpiresAt;
      if (!token || !expiresAt || expiresAt.getTime() < now.getTime()) {
        const gen = generateFeedbackToken(iv.id, iv.orgId);
        token = gen.token;
        expiresAt = gen.expiresAt;
      }

      await prisma.interview.update({
        where: { id: iv.id },
        data: {
          status: "IntCompleted",
          feedbackToken: token,
          feedbackTokenExpiresAt: expiresAt,
          feedbackRequestSentAt: new Date(),
        },
      });

      if (!iv.interviewer.workEmail) { skippedNoEmail++; continue; }

      const pipeline = iv.application?.requisition?.pipelineId
        ? await prisma.hiringPipeline.findFirst({ where: { id: iv.application.requisition.pipelineId, orgId: iv.orgId } })
        : await prisma.hiringPipeline.findFirst({ where: { orgId: iv.orgId, isDefault: true } });
      const stages = stageNames(pipeline?.stages);
      const roundName = stages[iv.round - 1] ?? `Round ${iv.round}`;

      const company = await prisma.companySettings.findUnique({
        where: { orgId: iv.orgId }, select: { companyName: true },
      });

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
      };

      // mailed = queued; the email worker handles delivery + retries.
      await resolveAndSend(iv.orgId, {
        key: "interview.feedback-request",
        to: iv.interviewer.workEmail,
        vars: { ...fbData },
        fallback: () => buildInterviewFeedbackRequestEmail(fbData),
      });
      mailed++;
    } catch (e) {
      failed++;
      errors.push(`${iv.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: { scanned: candidates.length, processed, mailed, skippedNoEmail, failed, errors: errors.slice(0, 10) },
  });
}
