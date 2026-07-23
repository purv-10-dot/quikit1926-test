import { emailShell, hero, checklist, alert, detailBlock, btnPrimary, para, esc } from "./_base";

export interface CandidateDocRequestEmailData {
  candidateName: string;
  jobTitle: string;
  bundle: "PreOffer" | "PostOffer";
  portalUrl: string;
  expiryDays: number;
  docs: Array<{ name: string; isRequired: boolean; helpText?: string | null }>;
  companyName: string;
  senderName?: string | null;
  senderPhone?: string | null;
  startDate?: string | null;
  location?: string | null;
  acceptanceDeadline?: string | null;
  /** HR-set "submit your documents by" date, shown as a callout. */
  submissionDeadline?: string | null;
  isReminder?: boolean;
  reminderLevel?: 1 | 2 | 3;
}

export function buildCandidateDocRequestEmail(data: CandidateDocRequestEmailData): { subject: string; html: string } {
  const isPre = data.bundle === "PreOffer";
  const isReminder = !!data.isReminder;
  const level = data.reminderLevel ?? 1;

  const processWord = isPre ? "hiring" : "onboarding";

  const docItems = data.docs.map((d) => {
    const bits: string[] = [];
    if (d.helpText) bits.push(d.helpText);
    if (!d.isRequired) bits.push("Optional");
    return { text: d.name, sub: bits.length ? bits.join(" · ") : undefined };
  });

  const deadline = data.submissionDeadline ?? data.acceptanceDeadline ?? null;

  const body = [
    isReminder
      ? alert("warning", `Reminder ${data.reminderLevel ? `(#${data.reminderLevel})` : ""} — your documents are still pending.`)
      : "",
    hero({
      title: "Document Verification",
      subtitle: `Please upload the following documents to continue the ${processWord} process.`,
      accent: "violet",
    }),
    para(`Hello <strong>${esc(data.candidateName)}</strong>, please submit the documents below for your <strong>${esc(data.jobTitle)}</strong> application.`),
    checklist(docItems, { heading: "Required Documents", accent: "violet" }),
    alert("warning", "Kindly upload clear and valid documents. Ensure all details are clearly visible.", "Please Note"),
    deadline ? detailBlock([["Submission Deadline", esc(deadline)]], { accent: "violet" }) : "",
    btnPrimary("Upload Documents", data.portalUrl, "violet"),
  ].join("");

  const html = emailShell({
    accent: "violet",
    companyName: data.companyName,
    preheader: isReminder
      ? `Reminder: documents pending for your ${data.jobTitle} application`
      : `Please upload your documents to continue the ${processWord} process`,
    body,
    helpName: data.senderName,
    helpPhone: data.senderPhone,
  });

  const subjectBase = isPre
    ? `Next steps — document submission (${data.candidateName})`
    : `Offer & joining documents — ${data.jobTitle}`;
  const subject = isReminder
    ? (level === 1 ? `Reminder: please upload your documents — ${data.jobTitle}`
      : level === 2 ? `[2nd reminder] Documents pending — ${data.jobTitle}`
                     : `[OVERDUE] Documents pending — ${data.jobTitle}`)
    : subjectBase;

  return { subject, html };
}
