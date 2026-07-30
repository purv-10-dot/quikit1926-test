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
        "danger",
        `As per our current hiring policy, there is a <strong>${data.coolingMonths}-month</strong> waiting period before a fresh application can be considered. You are warmly welcome to apply again for any suitable opening <strong>on or after ${esc(data.coolingUntil)}</strong>.`,
        "Please note",
      )
    : "";

  const body = `${hero({
    title: "Update on Your Application",
    subtitle: `Thank you for your interest in ${esc(data.companyName)}.`,
    accent: "blue",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `Thank you for taking the time to apply for the <strong>${esc(data.jobTitle)}</strong> role at ${esc(data.companyName)} and for sharing your background with us.`,
  )}${para(
    `After careful consideration, we've decided not to move forward with your application for this position. Please know this was a difficult decision — we genuinely valued the experience you bring, and this outcome reflects the needs of this specific role rather than your abilities.`,
  )}${para(
    `We'd be glad to see you apply again for future openings that match your skills, and we'll keep your profile on record.`,
  )}${coolNote}${para(`We wish you all the very best in your career, and we hope our paths cross again.`)}`;

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Update on your application — ${data.jobTitle}`,
    body,
  });

  return { subject: `Update on your application — ${data.jobTitle}`, html };
}
