import { emailShell, hero, para, esc } from "./_base";

export interface OfferResponseEmailData {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  accepted: boolean;
}

/** Confirmation sent to the candidate right after they accept/decline. */
export function buildOfferResponseEmail(data: OfferResponseEmailData): { subject: string; html: string } {
  const first = data.candidateName.split(/\s+/)[0] || data.candidateName;
  const body = data.accepted
    ? hero({ emoji: "🎉", title: "Offer Accepted", subtitle: `Welcome aboard, ${esc(first)}!`, accent: "green" }) +
      para(`Dear <strong>${esc(data.candidateName)}</strong>,`) +
      para(`Thank you for accepting the offer for <strong>${esc(data.jobTitle)}</strong> at <strong>${esc(data.companyName)}</strong>. We're thrilled to have you join us.`) +
      para(`Our HR team will be in touch shortly with your onboarding details and next steps. If you have any questions in the meantime, just reply to this email.`)
    : hero({ emoji: "📩", title: "Response Received", subtitle: "Thank you for letting us know.", accent: "blue" }) +
      para(`Dear <strong>${esc(data.candidateName)}</strong>,`) +
      para(`We've recorded that you've declined the offer for <strong>${esc(data.jobTitle)}</strong> at <strong>${esc(data.companyName)}</strong>. We appreciate the time you invested with us and wish you the very best.`) +
      para(`Should anything change, feel free to reach out to our HR team.`);

  return {
    subject: data.accepted
      ? `Offer accepted — welcome to ${data.companyName}!`
      : `We've received your response — ${data.companyName}`,
    html: emailShell({
      accent: data.accepted ? "green" : "blue",
      companyName: data.companyName,
      preheader: data.accepted ? `You've accepted your offer from ${data.companyName}` : `Your response has been recorded`,
      body,
    }),
  };
}
