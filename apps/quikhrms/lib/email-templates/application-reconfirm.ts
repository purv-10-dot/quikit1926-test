import { emailShell, hero, para, esc, btnPrimary, btnSecondary } from "./_base";

export interface ReconfirmEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  yesUrl?: string | null;
  noUrl?: string | null;
}

/**
 * Sent when a candidate is invited back after a hold. They only re-enter the
 * pipeline if they click "Yes, I'm interested"; "No" withdraws them. No reply =
 * they stay in the archive (never silently re-added).
 */
export function buildReconfirmEmail(data: ReconfirmEmailData): { subject: string; html: string } {
  const buttons = data.yesUrl
    ? `${btnPrimary("✓ Yes, I'm interested", data.yesUrl, "green")}${data.noUrl ? btnSecondary("No, please withdraw me", data.noUrl, "green") : ""}`
    : "";

  const body = `${hero({
    title: "Good news — we're moving forward again",
    subtitle: `An update on your application at ${esc(data.companyName)}.`,
    accent: "green",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `The <strong>${esc(data.jobTitle)}</strong> role at ${esc(data.companyName)} is active again and we would love to continue considering your application.`,
  )}${para(
    `Are you still interested and available? Please let us know:`,
  )}${buttons}${para(
    `If you're no longer available, that's completely fine — just click "No" and we'll close your application. We won't move you forward until you confirm.`,
  )}`;

  const html = emailShell({
    accent: "green",
    companyName: data.companyName,
    preheader: `Are you still interested? — ${data.jobTitle}`,
    body,
  });

  return { subject: `Are you still interested? — ${data.jobTitle}`, html };
}
