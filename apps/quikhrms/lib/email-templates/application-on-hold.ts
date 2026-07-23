import { emailShell, hero, para, esc } from "./_base";

export interface OnHoldEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}

export function buildOnHoldEmail(data: OnHoldEmailData): { subject: string; html: string } {
  const body = `${hero({
    title: "Your Application is On Hold",
    subtitle: `An update on your application at ${esc(data.companyName)}.`,
    accent: "amber",
  })}${para(`Dear <strong>${esc(data.candidateName)}</strong>,`)}${para(
    `Thank you for your interest in the <strong>${esc(data.jobTitle)}</strong> role at ${esc(data.companyName)}.`,
  )}${para(
    `We wanted to let you know that your application is currently <strong>on hold</strong>. This simply means we are not moving forward with the next steps right now — it is not a rejection.`,
  )}${para(
    `We will keep your profile on file and reach out if the position reopens or a suitable opportunity comes up. We appreciate your patience and continued interest.`,
  )}`;

  const html = emailShell({
    accent: "amber",
    companyName: data.companyName,
    preheader: `Your application is on hold — ${data.jobTitle}`,
    body,
  });

  return { subject: `Your application is on hold — ${data.jobTitle}`, html };
}
