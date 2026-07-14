import { emailShell, hero, para, esc } from "./_base";

export interface RejectionEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}

export function buildRejectionEmail(data: RejectionEmailData): { subject: string; html: string } {
  const body = `${hero({
    title: "Update on Your Application",
    subtitle: `Thank you for your interest in ${esc(data.companyName)}.`,
    accent: "blue",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `Thank you for taking the time to apply for the <strong>${esc(data.jobTitle)}</strong> role and for sharing your background with us.`,
  )}${para(
    `After careful consideration, we have decided not to move forward with your application at this time. This was a difficult decision — we were genuinely impressed by your experience, and we encourage you to apply for future openings that match your skills.`,
  )}${para(`We wish you all the very best in your career, and we hope our paths cross again.`)}`;

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Update on your application — ${data.jobTitle}`,
    body,
  });

  return { subject: `Update on your application — ${data.jobTitle}`, html };
}
