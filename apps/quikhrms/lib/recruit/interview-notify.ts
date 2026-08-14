import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInterviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { buildInterviewerNotificationEmail } from "@/lib/email-templates/interview-notification";
import { generateFeedbackToken } from "@/lib/services/feedback-token";
import { appBaseUrl } from "@/lib/utils/app-url";

export interface InterviewMailStatus {
  candidate: { sent: boolean; to: string | null; error?: string };
  interviewer: { sent: boolean; to: string | null; error?: string };
}

/**
 * Sends the interview invite emails (candidate + interviewer) for an interview.
 * Shared by the fresh-schedule flow and reschedule, so both notify the same way.
 * Best-effort — never throws.
 */
export async function sendInterviewInvites(orgId: string, interviewId: string): Promise<InterviewMailStatus> {
  const status: InterviewMailStatus = {
    candidate: { sent: false, to: null },
    interviewer: { sent: false, to: null },
  };
  try {
    const interview = await prisma.interview.findFirst({
      where: { id: interviewId, orgId, deletedAt: null },
      include: {
        interviewer: { select: { firstName: true, lastName: true, workEmail: true } },
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true, email: true, phone: true, resumeUrl: true } },
            requisition: { select: { title: true } },
          },
        },
      },
    });
    if (!interview) return status;

    const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const companyName = company?.companyName ?? "Our Company";
    const dt = new Date(interview.scheduledAt);
    // Format in IST — the server runs in UTC, so omitting timeZone shows the wrong time.
    const dateStr = dt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
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
      status.candidate = { sent: true, to: candidate.email };
    } else {
      status.candidate = { sent: false, to: null, error: "Candidate email missing" };
    }

    if (interview.interviewer.workEmail && candidate) {
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
      status.interviewer = { sent: true, to: interview.interviewer.workEmail };
    } else {
      status.interviewer = { sent: false, to: null, error: "Interviewer workEmail missing" };
    }
  } catch (e) {
    console.error("sendInterviewInvites failed:", e);
  }
  return status;
}
