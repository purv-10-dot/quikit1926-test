import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendMail } from "@/lib/services/mailer";
import { buildInterviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { buildInterviewerNotificationEmail } from "@/lib/email-templates/interview-notification";

const bodySchema = z.object({
  interviewId: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const interview = await prisma.interview.findFirst({
      where: { id: parsed.data.interviewId, orgId, deletedAt: null },
      include: {
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true, email: true, phone: true, resumeUrl: true } },
            requisition: { select: { title: true } },
          },
        },
        interviewer: { select: { firstName: true, lastName: true, workEmail: true } },
      },
    });
    if (!interview) return notFound("Interview not found");

    const candidate = interview.application?.candidate;
    if (!candidate?.email) return validationError("Candidate email missing");

    const company = await prisma.companySettings.findUnique({
      where: { orgId }, select: { companyName: true },
    });
    const companyName = company?.companyName ?? "Our Company";

    const dt = new Date(interview.scheduledAt);
    const dateStr = dt.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const interviewerName = `${interview.interviewer.firstName} ${interview.interviewer.lastName}`.trim();
    const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
    const jobTitle = interview.application?.requisition?.title ?? "the role";

    const candidateMail = buildInterviewInviteEmail({
      candidateName, jobTitle,
      interviewDate: dateStr, interviewTime: timeStr,
      duration: String(interview.duration),
      interviewerName,
      type: interview.type,
      meetingLink: interview.meetingLink,
      location: interview.location,
      companyName,
    });

    const candidateResult = await sendMail({ to: candidate.email, subject: candidateMail.subject, html: candidateMail.html });

    let interviewerSent = false;
    let interviewerError: string | null = null;
    if (interview.interviewer.workEmail) {
      const interviewerMail = buildInterviewerNotificationEmail({
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
      const r = await sendMail({ to: interview.interviewer.workEmail, subject: interviewerMail.subject, html: interviewerMail.html });
      interviewerSent = r.sent;
      if (!r.sent) interviewerError = r.error ?? "Mail send failed";
    } else {
      interviewerError = "Interviewer workEmail missing";
    }

    // Partial failures are NOT fatal — a candidate-side bounce (e.g. dummy
    // @example.com address) shouldn't 500 the request when the interviewer
    // mail succeeded. Caller inspects per-recipient .sent / .error.
    return successResponse({
      sent: candidateResult.sent && interviewerSent,
      interviewId: interview.id,
      candidate: { sent: candidateResult.sent, to: candidate.email, error: candidateResult.sent ? null : (candidateResult.error ?? "Mail send failed") },
      interviewer: { sent: interviewerSent, to: interview.interviewer.workEmail ?? null, error: interviewerError },
    });
  } catch (error) {
    console.error("POST /mail/interview error:", error);
    return internalError();
  }
});
