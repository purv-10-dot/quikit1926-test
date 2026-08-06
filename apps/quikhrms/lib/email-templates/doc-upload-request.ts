import { emailShell, hero, para, checklist, alert, btnPrimary, esc } from "./_base";

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

export interface DocRejectedEmailData {
  candidateName: string;
  companyName: string;
  docName: string;
  reason?: string | null;
  link: string;
}

/** Sent to the new hire when HR rejects one of their uploaded documents. */
export function buildDocRejectedEmail(data: DocRejectedEmailData): { subject: string; html: string } {
  const first = data.candidateName.split(/\s+/)[0] || data.candidateName;
  const body =
    hero({ emoji: "⚠️", title: "A document needs re-upload", subtitle: `Onboarding at ${esc(data.companyName)}`, accent: "amber" }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(`Your uploaded <strong>${esc(data.docName)}</strong> couldn't be accepted and needs to be re-uploaded.`) +
    alert("warning", data.reason ? esc(data.reason) : "Please check the file and upload it again.", "Reason") +
    btnPrimary("Re-upload document", data.link, "amber") +
    para(`This is a secure, private link meant only for you.`);

  return {
    subject: `Action needed: re-upload ${data.docName} — ${data.companyName}`,
    html: emailShell({
      accent: "amber",
      companyName: data.companyName,
      preheader: `${data.docName} needs to be re-uploaded for your onboarding at ${data.companyName}`,
      body,
    }),
  };
}
