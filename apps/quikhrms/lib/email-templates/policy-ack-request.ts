import { emailShell, hero, para, checklist, btnPrimary, esc } from "./_base";

export interface PolicyAckRequestEmailData {
  candidateName: string;
  companyName: string;
  files: string[]; // file names to acknowledge
  link: string;
}

/** Sent to the new hire asking them to read & acknowledge policy / training material. */
export function buildPolicyAckRequestEmail(data: PolicyAckRequestEmailData): { subject: string; html: string } {
  const first = data.candidateName.split(/\s+/)[0] || data.candidateName;
  const body =
    hero({ emoji: "📘", title: "Please read & acknowledge", subtitle: `Onboarding at ${esc(data.companyName)}`, accent: "green" }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(`Please review the following document${data.files.length > 1 ? "s" : ""} and confirm you have read ${data.files.length > 1 ? "them" : "it"} using the secure link below.`) +
    checklist(data.files.map((f) => ({ text: esc(f) })), { heading: "To acknowledge", accent: "green" }) +
    btnPrimary("Review & acknowledge", data.link, "green") +
    para(`This is a secure, private link meant only for you.`);

  return {
    subject: `Action needed: review & acknowledge — ${data.companyName}`,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `Review & acknowledge your onboarding material for ${data.companyName}`,
      body,
    }),
  };
}
