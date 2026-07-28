import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyFeedbackToken } from "@/lib/services/feedback-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { stageNames } from "@/lib/services/pipeline-stages";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";
import { sendRejectionEmail } from "@/lib/recruit/rejection-mail";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";

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
          // email is used server-side for the candidate rejection email (POST);
          // it is deliberately NOT included in the GET response (REC-015).
          candidate: { select: { firstName: true, lastName: true, email: true, resumeUrl: true, currentCompany: true, currentDesignation: true, totalExperience: true } },
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
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.feedback-token.get", clientIp(req), 40, 60);
  if (rl) return rl;
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
  overallRating: z.number().int().min(1).max(10),
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
  const rl = await rateLimitOrResponse("recruit.feedback-token.post", clientIp(req), 12, 60);
  if (rl) return rl;
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

  // Submitting feedback (via the reminder link) does NOT auto-advance the stage.
  // Advancing is a deliberate action from the pipeline UI, which requires this
  // feedback to exist AND creates the next stage's interview stub. Auto-advancing
  // here pushed candidates into the next stage with no interview scheduled.
  // A strongly negative recommendation still auto-rejects (terminal, no scheduling).
  if (data.recommendation === "NoHire" || data.recommendation === "StrongNoHire") {
    await prisma.jobApplication.update({
      where: { id: iv.applicationId },
      data: {
        status: "AppRejected",
        rejectionReason: data.concerns || data.overallComments || "Rejected via interviewer feedback",
        rejectedAt: new Date(),
      },
    }).catch(() => null);

    // Notify the candidate (with the re-apply cooling note). Background.
    if (iv.application?.candidate?.email) {
      void sendRejectionEmail(iv.orgId, {
        to: iv.application.candidate.email,
        candidateName: `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim(),
        jobTitle: iv.application.requisition?.title ?? "the role",
      });
    }
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
            <li><strong>Rating:</strong> ${data.overallRating}/10</li>
            <li><strong>Recommendation:</strong> ${data.recommendation}</li>
            ${data.strengths ? `<li><strong>Strengths:</strong> ${data.strengths}</li>` : ""}
            ${data.concerns ? `<li><strong>Concerns:</strong> ${data.concerns}</li>` : ""}
            ${data.overallComments ? `<li><strong>Comments:</strong> ${data.overallComments}</li>` : ""}
          </ul>
          <p style="color:#6b7280;font-size:12px;">${companyName} HRMS</p>
        </div>`;
      await resolveAndSend(iv.orgId, {
        key: "interview.hr-notify",
        to: hr.workEmail,
        vars: {
          hrName: `${hr.firstName} ${hr.lastName}`.trim(),
          interviewerName: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(),
          candidateName: `${iv.application.candidate.firstName} ${iv.application.candidate.lastName}`.trim(),
          requisitionTitle: iv.application.requisition.title,
          overallRating: `${data.overallRating}/10`,
          recommendation: data.recommendation ?? "",
          strengths: data.strengths ?? "",
          concerns: data.concerns ?? "",
          overallComments: data.overallComments ?? "",
          companyName,
        },
        fallback: () => ({ subject, html }),
      });
    } catch (e) { console.error("HR notify after token feedback failed:", e); }
  })();

  return ok({ submitted: true, scorecardId: iv.id });
}
