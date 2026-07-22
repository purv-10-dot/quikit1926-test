import { emailShell, hero, para, esc } from "./_base";

export interface InterviewPassedEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  /** e.g. "Round 2" — the round the candidate just cleared. */
  roundName: string;
}

/**
 * Default (fallback) template for the "you cleared this interview round" email,
 * sent to a candidate when an interviewer submits a positive recommendation.
 * A per-org customized ("dynamic") version can override this via the
 * `recruit.interview-passed` registry key.
 */
export function buildInterviewPassedEmail(data: InterviewPassedEmailData): { subject: string; html: string } {
  const body = `${hero({
    title: "Congratulations — You've Cleared This Round!",
    subtitle: `Great news on your application at ${esc(data.companyName)}.`,
    accent: "green",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `We're delighted to share that you've successfully cleared <strong>${esc(data.roundName)}</strong> for the <strong>${esc(data.jobTitle)}</strong> role at ${esc(data.companyName)}. 🎉`,
  )}${para(
    `Our team was genuinely impressed with your performance. We'll be in touch shortly with the next steps in the process.`,
  )}${para(
    `Thank you for your continued interest — we're excited to keep moving forward with you.`,
  )}`;

  const html = emailShell({
    accent: "green",
    companyName: data.companyName,
    preheader: `You've cleared ${data.roundName} — ${data.jobTitle}`,
    body,
  });

  return { subject: `Congratulations! You've cleared ${data.roundName} — ${data.jobTitle}`, html };
}
