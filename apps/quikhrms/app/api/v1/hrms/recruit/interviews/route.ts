import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createInterviewSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { stageNames } from "@/lib/services/pipeline-stages";
import { queueEmail } from "@/lib/services/mailer";
import { buildInterviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { buildInterviewerNotificationEmail } from "@/lib/email-templates/interview-notification";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const applicationId = searchParams.get("applicationId");
    const interviewerId = searchParams.get("interviewerId");

    const where = {
      orgId, deletedAt: null,
      ...(applicationId && { applicationId }),
      ...(interviewerId && { interviewerId }),
    };

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where, orderBy: { scheduledAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          application: {
            select: {
              id: true,
              candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
              requisition: { select: { title: true } },
            },
          },
          interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        },
      }),
      prisma.interview.count({ where }),
    ]);
    // Scorecard fields now live on the interview row; re-expose under the
    // historical `scorecard` shape so existing consumers keep working.
    const shaped = interviews.map((i) => ({
      ...i,
      scorecard: i.overallRating != null
        ? {
            id: i.id, overallRating: i.overallRating, recommendation: i.recommendation,
            criteria: i.criteria, strengths: i.strengths, concerns: i.concerns,
            overallComments: i.overallComments, submittedAt: i.scorecardSubmittedAt,
          }
        : null,
    }));
    return successResponse(shaped, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/interviews error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createInterviewSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const scheduledAt = new Date(data.scheduledAt);

    const existing = await prisma.interview.findFirst({
      where: {
        orgId,
        applicationId: data.applicationId,
        round: data.round,
        interviewerId: data.interviewerId,
        scheduledAt,
        deletedAt: null,
      },
    });
    if (existing) return conflict("Interview already scheduled for this round + time");

    const interview = await prisma.interview.create({
      data: {
        orgId, applicationId: data.applicationId,
        round: data.round, type: data.type, interviewerId: data.interviewerId,
        scheduledAt, duration: data.duration,
        location: data.location, meetingLink: data.meetingLink,
        createdBy: userId, updatedBy: userId,
      },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true, email: true, phone: true, resumeUrl: true } },
            requisition: { select: { title: true } },
          },
        },
      },
    });

    // Auto-send invite emails to BOTH candidate and interviewer (regardless of interview type).
    let mailStatus: { candidate: { sent: boolean; to: string | null; error?: string }; interviewer: { sent: boolean; to: string | null; error?: string } } = {
      candidate: { sent: false, to: null }, interviewer: { sent: false, to: null },
    };
    try {
      const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
      const companyName = company?.companyName ?? "Our Company";
      const dt = new Date(interview.scheduledAt);
      const dateStr = dt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const candidate = interview.application?.candidate;
      const interviewerName = `${interview.interviewer.firstName} ${interview.interviewer.lastName}`.trim();
      const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : "Candidate";
      const jobTitle = interview.application?.requisition?.title ?? "the role";

      if (candidate?.email) {
        const m = buildInterviewInviteEmail({
          candidateName, jobTitle,
          interviewDate: dateStr, interviewTime: timeStr,
          duration: String(interview.duration),
          interviewerName,
          type: interview.type,
          meetingLink: interview.meetingLink,
          location: interview.location,
          companyName,
        });
        // sent = queued; the email worker handles delivery + retries.
        await queueEmail(orgId, { to: candidate.email, subject: m.subject, html: m.html, kind: "interview.candidate-invite" });
        mailStatus.candidate = { sent: true, to: candidate.email };
      } else {
        mailStatus.candidate = { sent: false, to: null, error: "Candidate email missing" };
      }

      if (interview.interviewer.workEmail && candidate) {
        const m = buildInterviewerNotificationEmail({
          interviewerName,
          candidateName,
          candidateEmail: candidate.email,
          candidatePhone: candidate.phone,
          jobTitle,
          interviewDate: dateStr,
          interviewTime: timeStr,
          duration: String(interview.duration),
          type: interview.type,
          meetingLink: interview.meetingLink,
          location: interview.location,
          companyName,
          roundName: `Round ${interview.round}`,
          resumeUrl: candidate.resumeUrl,
        });
        await queueEmail(orgId, { to: interview.interviewer.workEmail, subject: m.subject, html: m.html, kind: "interview.interviewer-notify" });
        mailStatus.interviewer = { sent: true, to: interview.interviewer.workEmail };
      } else {
        mailStatus.interviewer = { sent: false, to: null, error: "Interviewer workEmail missing" };
      }
    } catch (e) {
      console.error("Interview auto-mail failed:", e);
    }

    // Auto-advance application.currentStage to the interview's pipeline stage.
    // Use the candidate's OWN pipeline so multi-pipeline orgs stay consistent
    // with the Schedule modal (which already picks stages from that pipeline).
    const appForPipeline = await prisma.jobApplication.findUnique({
      where: { id: data.applicationId },
      select: { requisition: { select: { pipelineId: true } } },
    });
    const pipeline = appForPipeline?.requisition.pipelineId
      ? await prisma.hiringPipeline.findUnique({ where: { id: appForPipeline.requisition.pipelineId } })
      : await prisma.hiringPipeline.findFirst({ where: { orgId, deletedAt: null, isDefault: true } });
    const stages = stageNames(pipeline?.stages);
    // Stage is derived from the round index (each interview round maps to a
    // stage in the candidate's pipeline).
    const newStage = stages[data.round - 1];
    if (newStage) {
      const app = await prisma.jobApplication.findFirst({
        where: { id: data.applicationId, orgId, deletedAt: null },
        select: { currentStage: true, stageHistory: true },
      });
      if (app && app.currentStage !== newStage) {
        const history = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
        await prisma.jobApplication.update({
          where: { id: data.applicationId },
          data: {
            currentStage: newStage,
            stageHistory: JSON.parse(JSON.stringify([
              ...history,
              { stage: newStage, date: new Date().toISOString(), movedBy: userId, reason: "Interview scheduled" },
            ])),
            updatedBy: userId,
          },
        });
      }
    }

    return successResponse({ ...interview, mailStatus }, undefined, 201);
  } catch (error) { console.error("POST /recruit/interviews error:", error); return internalError(); }
});
