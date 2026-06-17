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
  isReminder?: boolean;
  reminderLevel?: 1 | 2 | 3;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildCandidateDocRequestEmail(data: CandidateDocRequestEmailData): { subject: string; html: string } {
  const isPre = data.bundle === "PreOffer";
  const isReminder = !!data.isReminder;
  const level = data.reminderLevel ?? 1;

  const accent = isReminder && level === 3 ? "#dc2626" : isReminder && level === 2 ? "#d97706" : isPre ? "#2563eb" : "#059669";
  const accentSoft = isReminder && level === 3 ? "#fef2f2" : isReminder && level === 2 ? "#fffbeb" : isPre ? "#eff6ff" : "#ecfdf5";
  const accentRing = isReminder && level === 3 ? "#fecaca" : isReminder && level === 2 ? "#fde68a" : isPre ? "#bfdbfe" : "#a7f3d0";

  const bundleLabel = isPre ? "Before Offer" : "After Offer";
  const headingBase = isPre
    ? `Congratulations — you've been shortlisted for the next stage`
    : `We are pleased to offer you the position of ${data.jobTitle}`;
  const heading = isReminder
    ? (level === 1 ? `Gentle reminder: documents pending` : level === 2 ? `Second reminder: documents still pending` : `Final reminder: documents overdue`)
    : headingBase;

  const docsListHtml = data.docs.map((d) => `
    <li style="margin:6px 0;font-size:13px;line-height:1.6;color:#1f2937;">
      <strong style="color:#111827;">${escape(d.name)}</strong>${d.isRequired ? ` <span style="color:#dc2626;">*</span>` : ` <span style="font-size:11px;color:#6b7280;">(optional)</span>`}
      ${d.helpText ? `<br><span style="font-size:11px;color:#6b7280;">${escape(d.helpText)}</span>` : ""}
    </li>`).join("");

  const preOfferBody = `
    <p style="margin:0;font-size:14px;color:#111827;">Hello <strong>${escape(data.candidateName)}</strong>,</p>
    <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">Greetings from <strong>${escape(data.companyName)}</strong>!</p>
    <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      Congratulations — after carefully reviewing your profile and interview performance, you have been shortlisted for the next stage of our selection process for the position of <strong>${escape(data.jobTitle)}</strong>. Your knowledge, skills and experience were found to be highly relevant and we believe you could be a strong addition to our team.
    </p>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      To proceed with the next steps in our onboarding and evaluation process, kindly share the following documents:
    </p>`;

  const postOfferBody = `
    <p style="margin:0;font-size:14px;color:#111827;">Dear <strong>${escape(data.candidateName)}</strong>,</p>
    <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">We are all very excited to discuss and get to know you.</p>
    <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      We have been impressed with your background and would like to formally offer you the position of <strong>${escape(data.jobTitle)}</strong> in our organization.
    </p>
    ${data.startDate ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">Your expected starting date is <strong>${escape(data.startDate)}</strong>${data.acceptanceDeadline ? `, and the offer will be revoked if joining formalities are not completed by <strong>${escape(data.acceptanceDeadline)}</strong>` : ""}.</p>` : ""}
    <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      At the beginning of your employment, you will be asked to sign a contract agreement — including confidentiality, non-disclosure and non-compete clauses.
    </p>
    ${data.acceptanceDeadline ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">We would like to have your response by <strong>${escape(data.acceptanceDeadline)}</strong>.</p>` : ""}
    <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      With the acceptance of the offer letter, you will be required to submit the documents mentioned below:
    </p>`;

  const reminderBody = `
    <p style="margin:0;font-size:14px;color:#111827;">Hello <strong>${escape(data.candidateName)}</strong>,</p>
    <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
      This is a ${level === 1 ? "gentle" : level === 2 ? "second" : "final"} reminder that we are still awaiting documents for your <strong>${escape(data.jobTitle)}</strong> application (${bundleLabel.toLowerCase()} bundle). Hiring decisions depend on this — please upload at the earliest.
    </p>`;

  const body = isReminder ? reminderBody : (isPre ? preOfferBody : postOfferBody);

  const footerDetails = (!isReminder && !isPre) ? `
    <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Reporting & Joining</p>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
      <li>Reporting Time: <strong>10 AM on your first day</strong></li>
      ${data.location ? `<li>Location: ${escape(data.location)}</li>` : ""}
    </ul>
    ${data.senderName ? `
      <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#1f2937;">
        <strong>${escape(data.senderName)}</strong> will be your immediate contact person for joining, offer letter, HR policies, and any process-related query.${data.senderPhone ? ` Contact: ${escape(data.senderPhone)}` : ""}
      </p>` : ""}
  ` : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:${accentSoft};color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="background:${accent};padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">${isReminder ? "Document Reminder" : bundleLabel}</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escape(heading)}</h1>
      </div>

      <div style="padding:26px 36px 4px;">
        ${body}

        <div style="margin:18px 0 0;padding:14px 20px;background:${accentSoft};border:1px solid ${accentRing};border-radius:8px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${accent};letter-spacing:0.5px;text-transform:uppercase;">Documents needed</p>
          <ol style="margin:8px 0 0;padding-left:22px;">${docsListHtml}</ol>
          <p style="margin:10px 0 0;font-size:11px;color:#6b7280;">Items marked * are mandatory. Optional items may be skipped.</p>
        </div>

        <div style="text-align:center;margin:28px 0 0;">
          <a href="${escape(data.portalUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:14px 34px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">Upload Documents →</a>
          <p style="margin:10px 0 0;font-size:11px;color:#6b7280;">Secure upload link. Valid for ${data.expiryDays} days. No login required.</p>
        </div>

        ${footerDetails}

        <p style="margin:24px 0 4px;font-size:14px;line-height:1.7;color:#1f2937;">
          We look forward to continuing the discussion with you. Please feel free to reach out if you have any questions.
        </p>

        <p style="margin:24px 0 0;font-size:14px;color:#111827;">Best regards,</p>
        <p style="margin:16px 0 0;font-size:14px;font-weight:700;color:#111827;">${escape(data.senderName ?? "HR Department")}</p>
        <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${escape(data.companyName)}</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated message from ${escape(data.companyName)} HRMS. Please do not reply.
      </div>
    </div>
  </div>
</body>
</html>`;

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
