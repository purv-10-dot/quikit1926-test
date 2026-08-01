import { emailShell, hero, para, detailBlock, btnPrimary, esc } from "./_base";

export interface TakeHomeSubmittedData {
  interviewerName: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  roundName?: string | null;
  submittedAt: string;
  hasFile: boolean;
  hasLink: boolean;
  reviewUrl: string;
}

/**
 * Interviewer-facing "Take-home task submitted" email. Sent when the candidate
 * submits their work on the tokenised public take-home page — nudges the
 * assigned interviewer to review it and leave feedback.
 */
export function buildTakeHomeSubmittedEmail(data: TakeHomeSubmittedData): { subject: string; html: string } {
  const rows: Array<[string, string] | null> = [
    ["Candidate", esc(data.candidateName)],
    ["Position", esc(data.jobTitle)],
    data.roundName ? ["Round", esc(data.roundName)] : null,
    ["Submitted", esc(data.submittedAt)],
    ["Includes", esc([data.hasFile && "file", data.hasLink && "link"].filter(Boolean).join(" + ") || "note only")],
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const body =
    hero({
      title: "Take-Home Task Submitted",
      subtitle: `${data.candidateName} has submitted their assignment.`,
      accent: "green",
    }) +
    para(`Hi <strong>${esc(data.interviewerName)}</strong>,`) +
    para(`<strong>${esc(data.candidateName)}</strong> has submitted their take-home task for <strong>${esc(data.jobTitle)}</strong>. Please review their work and submit your feedback.`) +
    detailBlock(filtered, { heading: "Submission", accent: "green" }) +
    btnPrimary("Review Submission", esc(data.reviewUrl), "green");

  const html = emailShell({
    accent: "green",
    companyName: data.companyName,
    preheader: `${data.candidateName} submitted their take-home task`,
    body,
  });

  const subject = `Take-home task submitted: ${data.candidateName}`;

  return { subject, html };
}
