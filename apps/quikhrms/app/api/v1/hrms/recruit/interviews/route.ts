import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createInterviewSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { stageNames } from "@/lib/services/pipeline-stages";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInterviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { buildInterviewerNotificationEmail } from "@/lib/email-templates/interview-notification";
import { generateMeetingLink } from "@/lib/meetings";
import { generateFeedbackToken } from "@/lib/services/feedback-token";

// Interview types that warrant an auto-generated video meeting link.
// Easy to extend (e.g. add "GroupDiscussion") if those go virtual.
const VIRTUAL_INTERVIEW_TYPES = new Set(["Video", "Panel"]);

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

    // Auto-generate a video meeting link for virtual interviews when the
    // recruiter didn't paste one. Provider-agnostic (Teams today, Google Meet
    // later); failures fall back to null so scheduling never breaks.
    let meetingLink = data.meetingLink ?? null;
    if (!meetingLink && VIRTUAL_INTERVIEW_TYPES.has(data.type)) {
      const appInfo = await prisma.jobApplication.findFirst({
        where: { id: data.applicationId, orgId, deletedAt: null },
        select: {
          candidate: { select: { firstName: true, lastName: true, email: true } },
          requisition: { select: { title: true } },
        },
      });
      const interviewer = await prisma.employee.findFirst({
        where: { id: data.interviewerId, orgId, deletedAt: null },
        select: { firstName: true, lastName: true, workEmail: true },
      });
      const subjectParts = ["Interview"];
      if (appInfo?.requisition?.title) subjectParts.push(appInfo.requisition.title);
      if (appInfo?.candidate) subjectParts.push(`${appInfo.candidate.firstName} ${appInfo.candidate.lastName}`.trim());
      // Invite both candidate and interviewer so the event lands on their
      // calendars (interviewer gets a Teams calendar invite; candidate too).
      const attendees = [
        appInfo?.candidate?.email
          ? { email: appInfo.candidate.email, name: `${appInfo.candidate.firstName} ${appInfo.candidate.lastName}`.trim() }
          : null,
        interviewer?.workEmail
          ? { email: interviewer.workEmail, name: `${interviewer.firstName} ${interviewer.lastName}`.trim() }
          : null,
      ].filter((a): a is { email: string; name: string } => a !== null);
      const meeting = await generateMeetingLink({
        subject: `${subjectParts.join(" – ")} (Round ${data.round})`,
        start: scheduledAt,
        end: new Date(scheduledAt.getTime() + data.duration * 60_000),
        attendees,
      });
      if (meeting) meetingLink = meeting.joinUrl;
    }

    const interview = await prisma.interview.create({
      data: {
        orgId, applicationId: data.applicationId,
        round: data.round, type: data.type, interviewerId: data.interviewerId,
        scheduledAt, duration: data.duration,
        location: data.location, meetingLink,
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
        const inviteData = {
          candidateName, jobTitle,
          interviewDate: dateStr, interviewTime: timeStr,
          duration: String(interview.duration),
          interviewerName,
          type: interview.type,
          meetingLink: interview.meetingLink,
          location: interview.location,
          companyName,
        };
        await resolveAndSend(orgId, {
          key: "interview.candidate-invite",
          to: candidate.email,
          vars: { ...inviteData, meetingLink: inviteData.meetingLink ?? "", location: inviteData.location ?? "" },
          fallback: () => buildInterviewInviteEmail(inviteData),
        });
        mailStatus.candidate = { sent: true, to: candidate.email };
      } else {
        mailStatus.candidate = { sent: false, to: null, error: "Candidate email missing" };
      }

      if (interview.interviewer.workEmail && candidate) {
        // Tokenised, no-login feedback link. Persisted on the interview so the
        // post-interview reminder/cron reuse the same token (see send-feedback-reminder).
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
        const { token: fbToken, expiresAt: fbExpiresAt } = generateFeedbackToken(interview.id, orgId);
        const notifyData = {
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
          feedbackUrl: base ? `${base}/interview-feedback/${fbToken}` : null,
        };
        await resolveAndSend(orgId, {
          key: "interview.interviewer-notify",
          to: interview.interviewer.workEmail,
          vars: {
            ...notifyData,
            candidatePhone: notifyData.candidatePhone ?? "",
            meetingLink: notifyData.meetingLink ?? "",
            location: notifyData.location ?? "",
            resumeUrl: notifyData.resumeUrl ?? "",
            feedbackUrl: notifyData.feedbackUrl ?? "",
          },
          fallback: () => buildInterviewerNotificationEmail(notifyData),
        });
        await prisma.interview.update({
          where: { id: interview.id },
          data: { feedbackToken: fbToken, feedbackTokenExpiresAt: fbExpiresAt },
        });
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
