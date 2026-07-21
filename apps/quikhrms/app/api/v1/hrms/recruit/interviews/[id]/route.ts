import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateInterviewSchema, createScorecardSchema } from "@/lib/validations/recruit";
import { generateMeetingLink } from "@/lib/meetings";
import { sendInterviewInvites } from "@/lib/recruit/interview-notify";
import { createAuditLog } from "@/lib/utils/audit";
import { notifyInterviewRescheduled, notifyInterviewCancelled } from "@/lib/services/interview-notifications";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInterviewPassedEmail } from "@/lib/email-templates/interview-passed";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const i = await prisma.interview.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        application: { include: { candidate: true, requisition: { select: { title: true } } } },
      },
    });
    if (!i) return notFound("Interview not found");
    // Scorecard fields now live on the interview row; expose them under the
    // historical `scorecard` shape so existing consumers keep working.
    return successResponse({
      ...i,
      scorecard: i.overallRating != null
        ? {
            id: i.id, interviewId: i.id, applicationId: i.applicationId,
            overallRating: i.overallRating, recommendation: i.recommendation,
            criteria: i.criteria, strengths: i.strengths, concerns: i.concerns,
            overallComments: i.overallComments, submittedAt: i.scorecardSubmittedAt,
          }
        : null,
    });
  } catch (error) { console.error("GET /recruit/interviews/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.interview.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Interview not found");
    const body = await req.json();

    // Check if it's a scorecard submission
    if (body.overallRating !== undefined) {
      const parsed = createScorecardSchema.safeParse({ ...body, interviewId: params.id, applicationId: existing.applicationId });
      if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

      const updated = await prisma.interview.update({
        where: { id: params.id },
        data: {
          overallRating: parsed.data.overallRating,
          recommendation: parsed.data.recommendation,
          criteria: parsed.data.criteria ? JSON.parse(JSON.stringify(parsed.data.criteria)) : undefined,
          strengths: parsed.data.strengths, concerns: parsed.data.concerns,
          overallComments: parsed.data.overallComments,
          scorecardSubmittedAt: new Date(),
          status: "IntCompleted", updatedBy: userId,
        },
      });
      const sc = {
        id: updated.id, interviewId: updated.id, applicationId: existing.applicationId,
        overallRating: updated.overallRating, recommendation: updated.recommendation,
        criteria: updated.criteria, strengths: updated.strengths, concerns: updated.concerns,
        overallComments: updated.overallComments, submittedAt: updated.scorecardSubmittedAt,
      };

      // Submitting feedback does NOT auto-advance the pipeline stage. Advancing
      // is a deliberate action from the pipeline UI (PATCH /applications/:id),
      // which (a) requires this feedback to exist before moving and (b) creates
      // the next stage's interview stub. Auto-advancing here bypassed both and
      // pushed candidates into the next stage with no interview scheduled.
      //
      // A strongly negative recommendation still auto-rejects the application —
      // rejection is terminal and needs no downstream scheduling.
      const rec = parsed.data.recommendation;
      if (rec === "NoHire" || rec === "StrongNoHire") {
        await prisma.jobApplication.update({
          where: { id: existing.applicationId },
          data: { status: "AppRejected", updatedBy: userId },
        });
      } else if (rec === "Hire" || rec === "StrongHire") {
        // Positive result → congratulate the candidate on clearing this round.
        // Best-effort background send; never blocks the feedback submission.
        void (async () => {
          try {
            const info = await prisma.jobApplication.findFirst({
              where: { id: existing.applicationId, orgId, deletedAt: null },
              select: {
                candidate: { select: { firstName: true, lastName: true, email: true } },
                requisition: { select: { title: true } },
              },
            });
            const cand = info?.candidate;
            if (!cand?.email) return;
            const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
            const companyName = company?.companyName ?? "Our Company";
            const candidateName = `${cand.firstName} ${cand.lastName}`.trim();
            const jobTitle = info?.requisition?.title ?? "the role";
            const roundName = `Round ${existing.round}`;
            await resolveAndSend(orgId, {
              key: "recruit.interview-passed",
              to: cand.email,
              vars: { candidateName, jobTitle, companyName, roundName },
              fallback: () => buildInterviewPassedEmail({ candidateName, jobTitle, companyName, roundName }),
            });
          } catch (e) {
            console.error("[interview] passed mail failed:", e);
          }
        })();
      }

      return successResponse(sc, undefined, 201);
    }

    const parsed = updateInterviewSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const i = await prisma.interview.update({
      where: { id: params.id },
      data: {
        // Rescheduling (new date) always brings the interview back to Scheduled,
        // even from a No-show / Cancelled state. An explicit status still wins.
        ...(data.status ? { status: data.status } : data.scheduledAt ? { status: "IntScheduled" } : {}),
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.meetingLink !== undefined && { meetingLink: data.meetingLink }),
        ...(data.candidateFeedback && { candidateFeedback: data.candidateFeedback }),
        updatedBy: userId,
      },
    });

    // Record cancel / no-show (with reason) to the audit trail.
    if (data.status === "IntCancelled" || data.status === "IntNoShow") {
      await createAuditLog({
        orgId, userId,
        action: data.status === "IntCancelled" ? "Update" : "StatusChange",
        entityType: "Interview",
        entityId: existing.id,
        request: req,
        metadata: {
          action: data.status === "IntCancelled" ? "InterviewCancelled" : "InterviewNoShow",
          round: existing.round,
          applicationId: existing.applicationId,
          reason: data.reason ?? null,
        },
      });
    }

    // In-app notification to the interviewer on cancel.
    if (data.status === "IntCancelled") {
      const info = await prisma.jobApplication.findFirst({
        where: { id: existing.applicationId, orgId },
        select: { candidate: { select: { firstName: true, lastName: true } }, requisition: { select: { title: true } } },
      });
      void notifyInterviewCancelled(orgId, {
        interviewId: existing.id, interviewerId: existing.interviewerId,
        candidateName: info?.candidate ? `${info.candidate.firstName} ${info.candidate.lastName}`.trim() : "the candidate",
        jobTitle: info?.requisition?.title ?? "the role",
      });
    }

    // Reschedule (new date/time) → mirror the fresh-schedule flow: regenerate a
    // virtual meeting link if none is set, keep it Scheduled, and re-notify the
    // candidate + interviewer with the new time.
    if (data.scheduledAt) {
      let meetingLink = i.meetingLink;
      if (!meetingLink && (i.type === "Video" || i.type === "Panel")) {
        try {
          const info = await prisma.jobApplication.findFirst({
            where: { id: i.applicationId, orgId, deletedAt: null },
            select: {
              candidate: { select: { firstName: true, lastName: true } },
              requisition: { select: { title: true } },
            },
          });
          const interviewer = await prisma.employee.findFirst({
            where: { id: i.interviewerId, orgId, deletedAt: null },
            select: { firstName: true, lastName: true, workEmail: true },
          });
          const parts = ["Interview"];
          if (info?.requisition?.title) parts.push(info.requisition.title);
          if (info?.candidate) parts.push(`${info.candidate.firstName} ${info.candidate.lastName}`.trim());
          const attendees = interviewer?.workEmail
            ? [{ email: interviewer.workEmail, name: `${interviewer.firstName} ${interviewer.lastName}`.trim() }]
            : [];
          const meeting = await generateMeetingLink({
            subject: `${parts.join(" – ")} (Round ${i.round})`,
            start: new Date(i.scheduledAt),
            end: new Date(new Date(i.scheduledAt).getTime() + i.duration * 60_000),
            attendees,
          });
          if (meeting) {
            meetingLink = meeting.joinUrl;
            await prisma.interview.update({ where: { id: i.id }, data: { meetingLink } });
          }
        } catch (e) { console.error("reschedule meeting-link regen failed:", e); }
      }
      if (!data.status && i.status !== "IntScheduled") {
        await prisma.interview.update({ where: { id: i.id }, data: { status: "IntScheduled" } });
      }
      // Send invites in the BACKGROUND so slow SMTP can't trip the client's 20s
      // timeout and leave the Schedule dialog stuck open — scheduling already saved.
      void sendInterviewInvites(orgId, i.id).catch((e) => console.error("[interview] invite mail failed:", e));
      // In-app notification to the interviewer on reschedule.
      const rInfo = await prisma.jobApplication.findFirst({
        where: { id: i.applicationId, orgId },
        select: { candidate: { select: { firstName: true, lastName: true } }, requisition: { select: { title: true } } },
      });
      const rDt = new Date(i.scheduledAt);
      const whenLabel = `${rDt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, ${rDt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`;
      void notifyInterviewRescheduled(orgId, {
        interviewId: i.id, interviewerId: i.interviewerId,
        candidateName: rInfo?.candidate ? `${rInfo.candidate.firstName} ${rInfo.candidate.lastName}`.trim() : "the candidate",
        jobTitle: rInfo?.requisition?.title ?? "the role", whenLabel,
      });
      return successResponse({ ...i, meetingLink, mailStatus: "queued" });
    }

    return successResponse(i);
  } catch (error) { console.error("PATCH /recruit/interviews/:id error:", error); return internalError(); }
});
