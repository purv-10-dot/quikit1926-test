import { emailShell, hero, detailBlock, checklist, timeline, para, esc } from "./_base";

export interface OfferDefaultData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC: number;
  joiningDate: string;
  joiningBonus?: number | null;
  expiresAt?: string | null;
  department?: string | null;
  reportingTo?: string | null;
  companyName: string;
  companyAddress?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  letterDate?: string | null;
  workLocation?: string | null;
}

const DOCUMENT_CHECKLIST: Array<{ text: string }> = [
  { text: "Mark sheets (10th, 12th, Graduation/Post-Graduation)" },
  { text: "PAN Card & Aadhaar Card" },
  { text: "Passport-size Photographs" },
  { text: "Bank Passbook / Cancelled Cheque" },
  { text: "Experience Letter (if any)" },
  { text: "Relieving Letter (if any)" },
  { text: "Signed Offer Letter, NDA & NCA" },
  { text: "Driving License" },
];

export function buildOfferDefaultEmail(data: OfferDefaultData): { subject: string; html: string } {
  const designation = data.designation ?? data.jobTitle;

  const rows: Array<[string, string]> = [["Position", esc(designation)]];
  if (data.department) rows.push(["Department", esc(data.department)]);
  if (data.reportingTo) rows.push(["Reporting To", esc(data.reportingTo)]);
  rows.push(["Joining Date", esc(data.joiningDate)]);
  rows.push(["Work Location", esc(data.workLocation ?? "On-site")]);
  rows.push(["Employment Type", "Full-Time"]);
  rows.push(["CTC", `₹${Number(data.offeredCTC).toLocaleString("en-IN")}`]);
  if (data.joiningBonus) {
    rows.push(["Joining Bonus", `₹${Number(data.joiningBonus).toLocaleString("en-IN")}`]);
  }

  const signatory = data.signatoryName
    ? para(
        `Regards,<br><strong>${esc(data.signatoryName)}</strong>${data.signatoryDesignation ? `, ${esc(data.signatoryDesignation)}` : ""}`,
      )
    : "";

  const body =
    hero({
      emoji: "🎉",
      title: "Congratulations!",
      subtitle: `Offer of Employment at ${esc(data.companyName)}.`,
      accent: "green",
    }) +
    para(`Dear <strong>${esc(data.candidateName)}</strong>,`) +
    para(
      `We are pleased to extend this offer of employment for the position of <strong>${esc(designation)}</strong> at <strong>${esc(data.companyName)}</strong>.`,
    ) +
    detailBlock(rows, { heading: "Offer Summary", accent: "green" }) +
    checklist(DOCUMENT_CHECKLIST, { heading: "Documents to Submit", accent: "green" }) +
    timeline(
      [
        { label: "Offer Sent" },
        { label: "Accept By", sub: data.expiresAt ?? undefined },
        { label: "Joining Date", sub: data.joiningDate },
      ],
      "green",
    ) +
    para("Please confirm your acceptance of this offer by replying to this email.") +
    signatory;

  const subject = `Job Offer — ${designation} at ${data.companyName}`;
  return {
    subject,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `Job offer for ${designation} at ${data.companyName}`,
      body,
      helpName: data.signatoryName ?? null,
      helpPhone: null,
      helpEmail: null,
      companyAddress: data.companyAddress ?? null,
    }),
  };
}
