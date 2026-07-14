import { emailShell, hero, para, detailBlock, alert, btnPrimary, esc } from "./_base";

export interface InterviewFeedbackRequestData {
  interviewerName: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  duration: string;
  type: string;
  roundName?: string | null;
  feedbackUrl: string;
  expiryDays: number;
  companyName: string;
  isReminder?: boolean;
  reminderLevel?: 1 | 2 | 3; // 24h, 48h, 72h
}

export function buildInterviewFeedbackRequestEmail(data: InterviewFeedbackRequestData): { subject: string; html: string } {
  const isReminder = !!data.isReminder;
  const level = data.reminderLevel ?? 1;

  const rows: Array<[string, string] | null> = [
    ["Candidate", esc(data.candidateName)],
    ["Position", esc(data.jobTitle)],
    data.roundName ? ["Round", esc(data.roundName)] : null,
    ["Date", esc(data.interviewDate)],
    ["Time", esc(data.interviewTime)],
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const stars = `<div style="text-align:center;margin:0 0 18px;"><span style="font-size:22px;color:#d1d5db;letter-spacing:4px;">★ ★ ★ ★ ★</span></div>`;

  const body =
    (isReminder ? alert("warning", "This is a reminder — your feedback is still pending.") : "") +
    hero({
      title: "Thank You!",
      subtitle: "How was your interview experience? We value your feedback.",
      accent: "blue",
    }) +
    para(`Hi <strong>${esc(data.interviewerName)}</strong>,`) +
    detailBlock(filtered, { heading: "Interview", accent: "blue" }) +
    stars +
    btnPrimary("Give Feedback", esc(data.feedbackUrl), "blue") +
    para(`<span style="font-size:12px;color:#6b7280;">This link expires in ${data.expiryDays} days.</span>`);

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: isReminder ? `Reminder: feedback pending for ${data.candidateName}` : `Share your feedback for ${data.candidateName}`,
    body,
  });

  const subject = isReminder
    ? (level === 1 ? `Reminder: submit feedback for ${data.candidateName}`
      : level === 2 ? `[2nd reminder] Feedback pending: ${data.candidateName}`
                     : `[OVERDUE] Feedback pending: ${data.candidateName}`)
    : `Feedback needed: ${data.candidateName} — ${data.jobTitle}`;

  return { subject, html };
}
