import { emailShell, hero, detailBlock, btnPrimary, btnSecondary, para, esc, BRAND } from "./_base";

export interface InterviewerNotificationData {
  interviewerName: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  duration: string;
  type: string;
  meetingLink?: string | null;
  location?: string | null;
  companyName: string;
  roundName?: string | null;
  resumeUrl?: string | null;
  feedbackUrl?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  Phone: "Phone Screen",
  Video: "Video Call",
  InPerson: "In-Person",
  Panel: "Panel Interview",
  TakeHome: "Take-Home Task",
  GroupDiscussion: "Group Discussion",
};

export function buildInterviewerNotificationEmail(data: InterviewerNotificationData): { subject: string; html: string } {
  const typeLabel = TYPE_LABEL[data.type] ?? data.type;

  const modeValue = data.meetingLink
    ? `${esc(typeLabel)} · <a href="${esc(data.meetingLink)}" style="color:${BRAND.primary};text-decoration:none;">${esc(data.meetingLink)}</a>`
    : data.location
      ? `${esc(typeLabel)} · ${esc(data.location)}`
      : esc(typeLabel);

  const detailRows: Array<[string, string] | null> = [
    ["Candidate", esc(data.candidateName)],
    ["Position", esc(data.jobTitle)],
    data.roundName ? ["Round", esc(data.roundName)] : null,
    ["Date", esc(data.interviewDate)],
    ["Time", `${esc(data.interviewTime)} IST`],
    ["Duration", esc(data.duration)],
    ["Mode", modeValue],
  ];

  const contactRows: Array<[string, string] | null> = [
    ["Email", `<a href="mailto:${esc(data.candidateEmail)}" style="color:${BRAND.primary};text-decoration:none;">${esc(data.candidateEmail)}</a>`],
    data.candidatePhone ? ["Phone", esc(data.candidatePhone)] : null,
  ];

  const notNull = (r: [string, string] | null): r is [string, string] => r !== null;

  const body = [
    hero({ title: "Interview Assignment", subtitle: "You've been assigned to interview a candidate.", accent: "blue" }),
    para(`Hi <strong>${esc(data.interviewerName)}</strong>, you've been assigned to interview a candidate for <strong>${esc(data.companyName)}</strong>. Details are below.`),
    detailBlock(detailRows.filter(notNull), { heading: "Interview Details", accent: "blue" }),
    detailBlock(contactRows.filter(notNull), { heading: "Candidate Contact", accent: "blue" }),
    data.meetingLink ? btnPrimary("Join Interview", data.meetingLink, "blue") : "",
    data.resumeUrl ? btnSecondary("View Resume", data.resumeUrl, "blue") : "",
    data.feedbackUrl ? btnSecondary("Submit Feedback", data.feedbackUrl, "blue") : "",
  ].join("");

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Interview assigned: ${data.candidateName} — ${data.jobTitle}`,
    body,
  });

  return {
    subject: `Interview assigned: ${data.candidateName} — ${data.jobTitle} (${data.interviewDate})`,
    html,
  };
}
