import { emailShell, hero, para, checklist, btnPrimary, esc } from "./_base";

export interface DocUploadRequestEmailData {
  candidateName: string;
  companyName: string;
  documents: string[];
  link: string;
}

/** Sent to the new hire asking them to upload their onboarding documents. */
export function buildDocUploadRequestEmail(data: DocUploadRequestEmailData): { subject: string; html: string } {
  const first = data.candidateName.split(/\s+/)[0] || data.candidateName;
  const body =
    hero({ emoji: "📄", title: "Please upload your documents", subtitle: `Onboarding at ${esc(data.companyName)}`, accent: "green" }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(`To continue your onboarding, please upload the following document${data.documents.length > 1 ? "s" : ""} using the secure link below.`) +
    checklist(data.documents.map((d) => ({ text: esc(d) })), { heading: "Documents required", accent: "green" }) +
    btnPrimary("Upload documents", data.link, "green") +
    para(`This is a secure, private link meant only for you.`);

  return {
    subject: `Action needed: upload your onboarding documents — ${data.companyName}`,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `Upload your onboarding documents for ${data.companyName}`,
      body,
    }),
  };
}
