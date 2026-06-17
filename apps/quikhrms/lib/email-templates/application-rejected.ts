import { baseLayout } from "./_base";

export interface RejectionEmailData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}

export function buildRejectionEmail(data: RejectionEmailData): { subject: string; html: string } {
  const html = baseLayout({
    title: "Application update",
    subtitle: `${data.companyName}`,
    greeting: `Hi <strong>${data.candidateName}</strong>,`,
    body: `
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Thank you for taking the time to apply for <strong>${data.jobTitle}</strong> and for going through our process.
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        After careful consideration, we've decided not to move forward with your application at this stage.
        This decision isn't a reflection of your skills — simply that we found profiles more closely matching the current role's needs.
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        We'll keep your profile on file for future openings that may be a better fit. Wishing you the very best.
      </p>
    `,
    companyName: data.companyName,
    accent: "#3b82f6",
  });

  return { subject: `Update on your application — ${data.jobTitle}`, html };
}
