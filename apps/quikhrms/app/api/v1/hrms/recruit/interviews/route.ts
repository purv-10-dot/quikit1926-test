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
import { notifyInterviewScheduled } from "@/lib/services/interview-notifications";
import { generateMeetingLink } from "@/lib/meetings";
import { appBaseUrl } from "@/lib/utils/app-url";
import { generateFeedbackToken } from "@/lib/services/feedback-token";
import { generateTakeHomeToken } from "@/lib/services/take-home-token";
import { buildTakeHomeTaskEmail } from "@/lib/email-templates/take-home-task";
import type { Prisma } from "@quikit/database";

// Interview types that warrant an auto-generated video meeting link.
// Easy to extend (e.g. add "GroupDiscussion") if those go virtual.
const VIRTUAL_INTERVIEW_TYPES = new Set(["Video", "Panel"]);

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const applicationId = searchParams.get("applicationId");
    const interviewerId = searchParams.get("interviewerId");

    const where: Prisma.InterviewWhereInput = {
      orgId, deletedAt: null,
      // Match the active pipeline exactly: only candidates still in play
      // (active / offered / on-hold) and not hired, rejected, blacklisted or
      // archived. Keeps the Interviews tab in sync with the pipeline board.
      application: {
        status: { in: ["AppActive", "AppOffered", "AppOnHold"] },
        candidate: { isBlacklisted: false, isArchived: false },
      },
      ...(applicationId && { applicationId }),
      ...(interviewerId && { interviewerId }),
    };

    // Keep the schedule in sync with the pipeline: cancel any still-"Scheduled"
    // interviews whose candidate is no longer active (rejected/withdrawn/declined).
    const stale = await prisma.interview.findMany({
      where: { orgId, deletedAt: null, status: "IntScheduled", application: { status: { in: ["AppRejected", "AppWithdrawn", "AppDeclined"] } } },
      select: { id: true },
    });
    if (stale.length) {
      await prisma.interview.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: "IntCancelled" },
      });
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where, orderBy: { scheduledAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          application: {
            select: {
              id: true,
              candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
              requisition: { select: { title: true, pipelineId: true } },
            },
          },
          interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    // Resolve each interview's stage name from ITS OWN requisition pipeline (not
    // a globally-selected one) so labels are correct when the org runs multiple
    // pipelines. Falls back to the default pipeline, then to "Round N".
    const pipelineIds = [...new Set(
      interviews.map((i) => i.application?.requisition?.pipelineId).filter((p): p is string => !!p),
    )];
    const pipelines = pipelineIds.length
      ? await prisma.hiringPipeline.findMany({ where: { orgId, deletedAt: null, id: { in: pipelineIds } }, select: { id: true, stages: true } })
      : [];
    const defaultPipeline = await prisma.hiringPipeline.findFirst({ where: { orgId, deletedAt: null, isDefault: true }, select: { stages: true } });
    const stagesByPipeline = new Map(pipelines.map((p) => [p.id, stageNames(p.stages)]));
    const defaultStages = stageNames(defaultPipeline?.stages);
    const resolveStage = (pipelineId: string | null | undefined, round: number) => {
      const stages = (pipelineId && stagesByPipeline.get(pipelineId)) || defaultStages;
      return stages[round - 1] ?? `Round ${round}`;
    };
    // Scorecard fields now live on the interview row; re-expose under the
    // historical `scorecard` shape so existing consumers keep working.
    const shaped = interviews.map((i) => ({
      ...i,
      stageName: resolveStage(i.application?.requisition?.pipelineId, i.round),
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
}, { requiredPermissions: ["hrms.recruit.read"] });

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

    // Validate the FKs up front (they're only looked up for virtual types below,
    // so an invalid id on an in-person interview would 500 on create).
    const [appExists, interviewerExists] = await Promise.all([
      prisma.jobApplication.findFirst({ where: { id: data.applicationId, orgId, deletedAt: null }, select: { id: true } }),
      prisma.employee.findFirst({ where: { id: data.interviewerId, orgId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!appExists) return validationError("Application not found");
    if (!interviewerExists) return validationError("Interviewer not found");

    // Additional panel interviewers: dedupe, drop the primary, validate they all
    // belong to the org. They get the same invite email + calendar attendance.
    const additionalIds = [...new Set((data.additionalInterviewerIds ?? []).filter((id) => id && id !== data.interviewerId))];
    const additionalInterviewers = additionalIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: additionalIds }, orgId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, workEmail: true },
        })
      : [];
    if (additionalInterviewers.length !== additionalIds.length) {
      return validationError("One or more additional interviewers not found");
    }

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
      // Only the (internal) interviewer is added as a Graph attendee so the event
      // lands on their calendar. The candidate is intentionally NOT invited here —
      // Microsoft would auto-send them its raw, unbranded calendar invite. The
      // candidate instead gets our own clean interview-invite email (below), which
      // already carries the join link.
      const attendees = [
        interviewer?.workEmail
          ? { email: interviewer.workEmail, name: `${interviewer.firstName} ${interviewer.lastName}`.trim() }
          : null,
        ...additionalInterviewers.map((a) =>
          a.workEmail ? { email: a.workEmail, name: `${a.firstName} ${a.lastName}`.trim() } : null,
        ),
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
        additionalInterviewerIds: additionalIds,
        scheduledAt, duration: data.duration,
        location: data.location, meetingLink,
        createdBy: userId, updatedBy: userId,
      },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true, email: true, phone: true, resumeUrl: true } },
            requisition: { select: { title: true, jobDescription: true, pipelineId: true } },
          },
        },
      },
    });

    // Scheduling a fresh interview for this round supersedes any prior
    // non-completed attempt (e.g. a No-show or an earlier Scheduled slot) so the
    // new one becomes the round's current record everywhere (pipeline + list).
    await prisma.interview.updateMany({
      where: {
        orgId, applicationId: data.applicationId, round: data.round,
        id: { not: interview.id }, deletedAt: null,
        status: { in: ["IntScheduled", "IntNoShow", "IntCancelled", "IntRescheduled"] },
      },
      data: { deletedAt: new Date(), updatedBy: userId },
    }).catch(() => null);

    // Take-Home Task: persist the brief + a fresh tokenised submission link via
    // RAW SQL. The take-home columns exist in the DB but the generated Prisma
    // client isn't regenerated, so they must never be touched through the typed
    // client. Strictly guarded behind type === "TakeHome" — every other type is
    // untouched. The token drives the candidate's public submission page.
    let takeHomeToken: string | null = null;
    if (data.type === "TakeHome") {
      const { token, expiresAt } = generateTakeHomeToken(interview.id, orgId);
      takeHomeToken = token;
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."Interview"
        SET "takeHomeInstructions" = ${data.takeHomeInstructions ?? null},
            "takeHomeAttachmentUrl" = ${data.takeHomeAttachmentUrl ?? null},
            "takeHomeAttachmentLink" = ${data.takeHomeAttachmentLink ?? null},
            "takeHomeDueDate" = ${data.takeHomeDueDate ?? null}::date,
            "submissionToken" = ${token},
            "submissionTokenExpiresAt" = ${expiresAt}
        WHERE id = ${interview.id} AND "orgId" = ${orgId}`;
    }

    // Resolve this round's pipeline stage once — reused for the "technical round"
    // JD decision below and the currentStage auto-advance further down.
    const pipeline = interview.application?.requisition?.pipelineId
      ? await prisma.hiringPipeline.findUnique({ where: { id: interview.application.requisition.pipelineId } })
      : await prisma.hiringPipeline.findFirst({ where: { orgId, deletedAt: null, isDefault: true } });
    const pipelineStageNames = stageNames(pipeline?.stages);
    const roundStage = pipelineStageNames[data.round - 1] ?? "";
    // JD sent to interviewers: an explicit override from the schedule dialog wins
    // (any round); otherwise the requisition JD is auto-shared on technical rounds.
    const isTechnicalRound = /technical/i.test(roundStage);
    const roundJobDescription =
      (data.jobDescription && data.jobDescription.trim())
        ? data.jobDescription.trim()
        : isTechnicalRound
          ? (interview.application?.requisition?.jobDescription ?? null)
          : null;

    // Auto-send invite emails to BOTH candidate and interviewer (regardless of interview type).
    let mailStatus: { candidate: { sent: boolean; to: string | null; error?: string }; interviewer: { sent: boolean; to: string | null; error?: string } } = {
      candidate: { sent: false, to: null }, interviewer: { sent: false, to: null },
    };
    try {
      const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
      const companyName = company?.companyName ?? "Our Company";
      const dt = new Date(interview.scheduledAt);
      // Format in IST — without an explicit timeZone the server (UTC) renders the
      // wrong time in the candidate/interviewer emails.
      const dateStr = dt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
      const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
      const candidate = interview.application?.candidate;
      const interviewerName = `${interview.interviewer.firstName} ${interview.interviewer.lastName}`.trim();
      const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : "Candidate";
      const jobTitle = interview.application?.requisition?.title ?? "the role";

      if (candidate?.email && interview.type === "TakeHome") {
        // Take-Home: send the task brief + tokenised submit link INSTEAD of the
        // standard interview invite. No meeting link is generated for this type.
        const base = appBaseUrl();
        const submitUrl = base && takeHomeToken ? `${base}/take-home/${takeHomeToken}` : "";
        const dueStr = data.takeHomeDueDate
          ? new Date(`${data.takeHomeDueDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
          : "";
        const thData = {
          candidateName, jobTitle, companyName,
          roundName: roundStage || `Round ${interview.round}`,
          instructions: data.takeHomeInstructions ?? "",
          dueDate: dueStr,
          submitUrl,
          hasAttachment: !!data.takeHomeAttachmentUrl,
          attachmentLink: data.takeHomeAttachmentLink ?? null,
        };
        void resolveAndSend(orgId, {
          key: "recruit.take-home-task",
          to: candidate.email,
          vars: { ...thData, roundName: thData.roundName ?? "", dueDate: thData.dueDate ?? "", hasAttachment: thData.hasAttachment, attachmentLink: thData.attachmentLink ?? "" },
          fallback: () => buildTakeHomeTaskEmail(thData),
        }).catch((e) => console.error("[interview] take-home mail failed:", e));
        mailStatus.candidate = { sent: true, to: candidate.email };
      } else if (candidate?.email) {
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
        // Background send so slow SMTP can't trip the client's 20s timeout and
        // leave the Schedule dialog stuck open — the interview is already saved.
        void resolveAndSend(orgId, {
          key: "interview.candidate-invite",
          to: candidate.email,
          vars: { ...inviteData, meetingLink: inviteData.meetingLink ?? "", location: inviteData.location ?? "" },
          fallback: () => buildInterviewInviteEmail(inviteData),
        }).catch((e) => console.error("[interview] candidate invite mail failed:", e));
        mailStatus.candidate = { sent: true, to: candidate.email };
      } else {
        mailStatus.candidate = { sent: false, to: null, error: "Candidate email missing" };
      }

      if (interview.interviewer.workEmail && candidate) {
        // Tokenised, no-login feedback link. Persisted on the interview so the
        // post-interview reminder/cron reuse the same token (see send-feedback-reminder).
        const base = appBaseUrl();
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
          jobDescription: roundJobDescription,
        };
        void resolveAndSend(orgId, {
          key: "interview.interviewer-notify",
          to: interview.interviewer.workEmail,
          vars: {
            ...notifyData,
            candidatePhone: notifyData.candidatePhone ?? "",
            meetingLink: notifyData.meetingLink ?? "",
            location: notifyData.location ?? "",
            resumeUrl: notifyData.resumeUrl ?? "",
            feedbackUrl: notifyData.feedbackUrl ?? "",
            jobDescription: notifyData.jobDescription ?? "",
          },
          fallback: () => buildInterviewerNotificationEmail(notifyData),
        }).catch((e) => console.error("[interview] interviewer notify mail failed:", e));
        await prisma.interview.update({
          where: { id: interview.id },
          data: { feedbackToken: fbToken, feedbackTokenExpiresAt: fbExpiresAt },
        });
        // In-app notification for the interviewer (alongside the email).
        void notifyInterviewScheduled(orgId, {
          interviewId: interview.id, interviewerId: interview.interviewer.id,
          candidateName, jobTitle, whenLabel: `${dateStr}, ${timeStr}`,
        });
        mailStatus.interviewer = { sent: true, to: interview.interviewer.workEmail };
      } else {
        mailStatus.interviewer = { sent: false, to: null, error: "Interviewer workEmail missing" };
      }

      // Additional panel interviewers get the same notification (details +
      // in-app alert). The feedback link is intentionally omitted — the
      // scorecard is owned by the primary interviewer.
      if (candidate && additionalInterviewers.length) {
        for (const extra of additionalInterviewers) {
          const extraName = `${extra.firstName} ${extra.lastName}`.trim();
          if (extra.workEmail) {
            const notifyData = {
              interviewerName: extraName,
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
              feedbackUrl: null as string | null,
              jobDescription: roundJobDescription,
            };
            void resolveAndSend(orgId, {
              key: "interview.interviewer-notify",
              to: extra.workEmail,
              vars: {
                ...notifyData,
                candidatePhone: notifyData.candidatePhone ?? "",
                meetingLink: notifyData.meetingLink ?? "",
                location: notifyData.location ?? "",
                resumeUrl: notifyData.resumeUrl ?? "",
                feedbackUrl: "",
                jobDescription: notifyData.jobDescription ?? "",
              },
              fallback: () => buildInterviewerNotificationEmail(notifyData),
            }).catch((e) => console.error("[interview] panel interviewer notify mail failed:", e));
          }
          void notifyInterviewScheduled(orgId, {
            interviewId: interview.id, interviewerId: extra.id,
            candidateName, jobTitle, whenLabel: `${dateStr}, ${timeStr}`,
          });
        }
      }
    } catch (e) {
      console.error("Interview auto-mail failed:", e);
    }

    // Auto-advance application.currentStage to the interview's pipeline stage.
    // Reuses the pipeline stage already resolved above (candidate's OWN pipeline),
    // where each interview round maps to a stage.
    const newStage = roundStage || undefined;
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
}, { requiredPermissions: ["hrms.recruit.write"] });
