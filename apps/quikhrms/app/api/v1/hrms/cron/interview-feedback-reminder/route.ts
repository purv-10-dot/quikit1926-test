import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInterviewFeedbackRequestEmail } from "@/lib/email-templates/interview-feedback-request";
import { stageNames } from "@/lib/services/pipeline-stages";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * POST /api/v1/hrms/cron/interview-feedback-reminder
 * Self-hosted cron endpoint. Call hourly.
 * Auth: header `x-cron-secret: $CRON_SECRET`
 *
 * Tiered reminders after the initial feedback-request mail:
 *   Level 1 at ~24h  → interviewer only
 *   Level 2 at ~48h  → interviewer + cc direct manager (reporting manager of candidate's role, fallback: interviewer's manager)
 *   Level 3 at ~72h  → interviewer + cc manager + cc HR
 *   After 7 days / scorecard submitted / token expired → stop.
 */

const HOUR = 3600_000;
const TIERS: Array<{ level: 1 | 2 | 3; minAgeMs: number; maxAgeMs: number }> = [
  { level: 1, minAgeMs: 24 * HOUR,  maxAgeMs: 48 * HOUR },
  { level: 2, minAgeMs: 48 * HOUR,  maxAgeMs: 72 * HOUR },
  { level: 3, minAgeMs: 72 * HOUR,  maxAgeMs: 7 * 24 * HOUR },
];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  const header = req.headers.get("x-cron-secret");
  if (header !== secret) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const base = appBaseUrl();

  const interviews = await prisma.interview.findMany({
    where: {
      deletedAt: null,
      feedbackRequestSentAt: { not: null },
      overallRating: null,
      status: { notIn: ["IntCancelled", "IntNoShow"] },
    },
    include: {
      interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true, reportingManagerId: true } },
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          requisition: { select: { title: true, pipelineId: true } },
        },
      },
    },
    take: 500,
  });

  let sent = 0, skipped = 0, failed = 0, overdue = 0;
  const errors: string[] = [];

  for (const iv of interviews) {
    if (!iv.feedbackRequestSentAt) continue;
    const age = now.getTime() - iv.feedbackRequestSentAt.getTime();

    // Past 7 days → stop reminders permanently
    if (age >= 7 * 24 * HOUR) { overdue++; continue; }

    const tier = TIERS.find((t) => age >= t.minAgeMs && age < t.maxAgeMs);
    if (!tier) { skipped++; continue; }

    // Avoid resending same tier (reminderCount tracks last-sent tier)
    if (iv.reminderCount >= tier.level) { skipped++; continue; }

    // Rate-limit: min 12h gap between any two reminders
    if (iv.lastReminderAt && now.getTime() - iv.lastReminderAt.getTime() < 12 * HOUR) { skipped++; continue; }

    if (!iv.interviewer.workEmail) { skipped++; continue; }
    if (!iv.feedbackToken) { skipped++; continue; }

    try {
      // Build cc list for tier 2+
      const ccList: string[] = [];
      if (tier.level >= 2) {
        // Reporting manager of interviewer
        if (iv.interviewer.reportingManagerId) {
          const mgr = await prisma.employee.findUnique({
            where: { id: iv.interviewer.reportingManagerId },
            select: { workEmail: true },
          });
          if (mgr?.workEmail) ccList.push(mgr.workEmail);
        }
      }
      if (tier.level >= 3) {
        const hrs = await prisma.employee.findMany({
          where: {
            orgId: iv.orgId, deletedAt: null, status: "Active",
            ...whereEmployeeHasAnyRole(["admin"]),
          },
          select: { workEmail: true, ...appRolesNameSelect },
        });
        const hr = sortByMaxRolePriorityDesc(hrs)[0] ?? null;
        if (hr?.workEmail) ccList.push(hr.workEmail);
      }

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
        feedbackUrl: `${base}/interview-feedback/${iv.feedbackToken}`,
        expiryDays: 7,
        companyName: company?.companyName ?? "Our Company",
        isReminder: true,
        reminderLevel: tier.level,
      };

      // sent = queued; the email worker handles delivery + retries.
      await resolveAndSend(iv.orgId, {
        key: "interview.feedback-reminder",
        to: iv.interviewer.workEmail,
        vars: { ...fbData, reminderLevel: tier.level },
        fallback: () => buildInterviewFeedbackRequestEmail(fbData),
        cc: ccList.length ? ccList : undefined,
      });

      await prisma.interview.update({
        where: { id: iv.id },
        data: { reminderCount: tier.level, lastReminderAt: now },
      });
      sent++;
    } catch (e) {
      failed++;
      errors.push(`${iv.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: { scanned: interviews.length, sent, skipped, failed, overdue, errors: errors.slice(0, 10) },
  });
}
