import { emailShell, hero, para, esc, alert } from "./_base";

export interface RejectionEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  /** Org's re-apply cooling period in months (0 / null = no note). */
  coolingMonths?: number | null;
  /** Formatted date the candidate becomes eligible to re-apply. */
  coolingUntil?: string | null;
}

export function buildRejectionEmail(data: RejectionEmailData): { subject: string; html: string } {
  const coolNote = data.coolingMonths && data.coolingMonths > 0 && data.coolingUntil
    ? alert(
        "info",
        `In line with our hiring policy, we're unable to consider a new application from you for the next <strong>${data.coolingMonths} month${data.coolingMonths > 1 ? "s" : ""}</strong> — until <strong>${esc(data.coolingUntil)}</strong>. You're warmly welcome to apply for our openings again after that date.`,
        "Please note",
      )
    : "";

  const body = `${hero({
    title: "Update on Your Application",
    subtitle: `Thank you for your interest in ${esc(data.companyName)}.`,
    accent: "blue",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `Thank you for taking the time to apply for the <strong>${esc(data.jobTitle)}</strong> role and for sharing your background with us.`,
  )}${para(
    `After careful consideration, we have decided not to move forward with your application at this time. This was a difficult decision — we were genuinely impressed by your experience, and we encourage you to apply for future openings that match your skills.`,
  )}${coolNote}${para(`We wish you all the very best in your career, and we hope our paths cross again.`)}`;

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Update on your application — ${data.jobTitle}`,
    body,
  });

  return { subject: `Update on your application — ${data.jobTitle}`, html };
}
