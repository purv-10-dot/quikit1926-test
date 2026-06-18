import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/services/feedback-token";
import { queueEmail } from "@/lib/services/mailer";
import { stageNames } from "@/lib/services/pipeline-stages";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

async function loadInterviewByToken(token: string) {
  const payload = verifyFeedbackToken(token);
  if (!payload) return { error: "Invalid or expired token" as const };

  const interview = await prisma.interview.findFirst({
    where: {
      id: payload.interviewId, orgId: payload.orgId,
      feedbackToken: token, deletedAt: null,
    },
    include: {
      interviewer: { select: { firstName: true, lastName: true, employeeCode: true, workEmail: true } },
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true, phone: true, resumeUrl: true, currentCompany: true, currentDesignation: true, totalExperience: true } },
          requisition: { select: { id: true, title: true, pipelineId: true } },
        },
      },
    },
  });
  if (!interview) return { error: "Interview not found" as const };
  if (interview.feedbackTokenExpiresAt && interview.feedbackTokenExpiresAt.getTime() < Date.now()) {
    return { error: "Link expired" as const };
  }
  return { interview };
}

/**
 * GET /api/v1/hrms/recruit/interview-feedback/[token]
 * Public — validates token and returns interview + candidate detail for the feedback form.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadInterviewByToken(token);
  if ("error" in r) return err("INVALID_TOKEN", r.error ?? "Invalid link", 400);

  const iv = r.interview;
  const pipeline = iv.application?.requisition?.pipelineId
    ? await prisma.hiringPipeline.findFirst({ where: { id: iv.application.requisition.pipelineId, orgId: iv.orgId } })
    : await prisma.hiringPipeline.findFirst({ where: { orgId: iv.orgId, isDefault: true } });
  const stages = stageNames(pipeline?.stages);
  const roundName = stages[iv.round - 1] ?? `Round ${iv.round}`;
  const company = await prisma.companySettings.findUnique({
    where: { orgId: iv.orgId }, select: { companyName: true },
  });

  return ok({
    alreadySubmitted: iv.overallRating != null,
    companyName: company?.companyName ?? "Our Company",
    interview: {
      id: iv.id,
      round: iv.round,
      roundName: roundName.replace(/([A-Z])/g, " $1").trim(),
      type: iv.type,
      scheduledAt: iv.scheduledAt,
      duration: iv.duration,
      interviewer: {
        name: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(),
        code: iv.interviewer.employeeCode,
      },
      candidate: {
        name: `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim(),
        email: iv.application.candidate.email,
        phone: iv.application.candidate.phone,
        resumeUrl: iv.application.candidate.resumeUrl,
        currentCompany: iv.application.candidate.currentCompany,
        currentDesignation: iv.application.candidate.currentDesignation,
        totalExperience: iv.application.candidate.totalExperience,
      },
      requisition: {
        id: iv.application.requisition.id,
        title: iv.application.requisition.title,
      },
    },
  });
}

const submitSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  recommendation: z.enum(["StrongHire", "Hire", "MaybeHire", "NoHire", "StrongNoHire"]),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
  overallComments: z.string().max(5000).optional(),
});

/**
 * POST /api/v1/hrms/recruit/interview-feedback/[token]
 * Public — interviewer submits scorecard. Token consumed on success.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadInterviewByToken(token);
  if ("error" in r) return err("INVALID_TOKEN", r.error ?? "Invalid link", 400);
  const iv = r.interview;
  if (iv.overallRating != null) return err("ALREADY_SUBMITTED", "Feedback already submitted for this interview", 409);

  const body = await req.json().catch(() => ({}));
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return err("VALIDATION_ERROR", "Validation failed", 422);
  const data = parsed.data;

  // Persist the scorecard onto the interview row + consume the token in one write.
  await prisma.interview.update({
    where: { id: iv.id },
    data: {
      overallRating: data.overallRating,
      recommendation: data.recommendation,
      strengths: data.strengths || undefined,
      concerns: data.concerns || undefined,
      overallComments: data.overallComments || undefined,
      scorecardSubmittedAt: new Date(),
      feedbackToken: null,
      feedbackTokenExpiresAt: null,
      status: "IntCompleted",
      updatedBy: iv.interviewer.employeeCode,
    },
  });

  // Advance stage if Approve + next stage exists (lightweight, no full stage-feedback route reuse)
  if (data.recommendation === "Hire" || data.recommendation === "StrongHire") {
    try {
      const pipeline = iv.application?.requisition?.pipelineId
        ? await prisma.hiringPipeline.findFirst({ where: { id: iv.application.requisition.pipelineId, orgId: iv.orgId } })
        : await prisma.hiringPipeline.findFirst({ where: { orgId: iv.orgId, isDefault: true } });
      const stages = stageNames(pipeline?.stages);
      const app = await prisma.jobApplication.findFirst({
        where: { id: iv.applicationId, orgId: iv.orgId, deletedAt: null },
        select: { currentStage: true, stageHistory: true },
      });
      if (app) {
        const idx = app.currentStage ? stages.indexOf(app.currentStage) : -1;
        const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
        if (next) {
          const history = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
          await prisma.jobApplication.update({
            where: { id: iv.applicationId },
            data: {
              currentStage: next,
              stageHistory: JSON.parse(JSON.stringify([
                ...history,
                { stage: next, date: new Date().toISOString(), movedBy: "feedback-token", reason: "Approved via feedback link" },
              ])),
            },
          });
        }
      }
    } catch (e) { console.error("stage-advance via feedback token failed:", e); }
  } else if (data.recommendation === "NoHire" || data.recommendation === "StrongNoHire") {
    await prisma.jobApplication.update({
      where: { id: iv.applicationId },
      data: {
        status: "AppRejected",
        rejectionReason: data.concerns || data.overallComments || "Rejected via interviewer feedback",
      },
    }).catch(() => null);
  }

  // Notify HR
  void (async () => {
    try {
      const hrs = await prisma.employee.findMany({
        where: {
          orgId: iv.orgId, deletedAt: null, status: "Active",
          ...whereEmployeeHasAnyRole(["admin"]),
        },
        select: { firstName: true, lastName: true, workEmail: true, ...appRolesNameSelect },
      });
      const hr = sortByMaxRolePriorityDesc(hrs)[0] ?? null;
      if (!hr?.workEmail) return;
      const company = await prisma.companySettings.findUnique({
        where: { orgId: iv.orgId }, select: { companyName: true },
      });
      const companyName = company?.companyName ?? "Our Company";
      const subject = `Interview feedback submitted — ${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;padding:20px;">
          <h2 style="color:#111;">Interview feedback received</h2>
          <p>Hi ${hr.firstName} ${hr.lastName},</p>
          <p>${iv.interviewer.firstName} ${iv.interviewer.lastName} has submitted feedback for <strong>${iv.application.candidate.firstName} ${iv.application.candidate.lastName}</strong> (${iv.application.requisition.title}).</p>
          <ul style="color:#374151;">
            <li><strong>Rating:</strong> ${data.overallRating}/5</li>
            <li><strong>Recommendation:</strong> ${data.recommendation}</li>
            ${data.strengths ? `<li><strong>Strengths:</strong> ${data.strengths}</li>` : ""}
            ${data.concerns ? `<li><strong>Concerns:</strong> ${data.concerns}</li>` : ""}
            ${data.overallComments ? `<li><strong>Comments:</strong> ${data.overallComments}</li>` : ""}
          </ul>
          <p style="color:#6b7280;font-size:12px;">${companyName} HRMS</p>
        </div>`;
      await queueEmail(iv.orgId, { to: hr.workEmail, subject, html, kind: "interview.hr-notify" });
    } catch (e) { console.error("HR notify after token feedback failed:", e); }
  })();

  return ok({ submitted: true, scorecardId: iv.id });
}
