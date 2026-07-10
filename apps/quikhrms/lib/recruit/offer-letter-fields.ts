/**
 * Dynamic fields available in the offer-letter body template. Client-safe (no
 * server deps) so both the Branding settings editor (chips) and the PDF
 * renderer (substitution) share one source of truth.
 *
 * Placeholders are written as `{{name}}` in the template body.
 */
export interface OfferLetterField {
  name: string;
  label: string;
  /** Sample value used for the Settings "Preview sample" render. */
  sample: string;
}

export const OFFER_LETTER_FIELDS: OfferLetterField[] = [
  { name: "candidateName", label: "Candidate name", sample: "Aarav Sharma" },
  { name: "candidateAddress", label: "Candidate address", sample: "12 MG Road, Indore, MP 452001" },
  { name: "jobTitle", label: "Job title", sample: "Senior Software Engineer" },
  { name: "designation", label: "Designation", sample: "Senior Software Engineer" },
  { name: "ctc", label: "Annual CTC", sample: "Rs. 18,00,000" },
  { name: "joiningDate", label: "Joining date", sample: "01 August 2026" },
  { name: "joiningBonus", label: "Joining bonus", sample: "Rs. 1,00,000" },
  { name: "relocationBonus", label: "Relocation allowance", sample: "Rs. 50,000" },
  { name: "equityGrant", label: "Equity grant", sample: "500 RSUs" },
  { name: "offerValidUntil", label: "Offer valid until", sample: "20 July 2026" },
  { name: "department", label: "Department", sample: "Engineering" },
  { name: "reportingManager", label: "Reporting manager", sample: "Priya Nair" },
  { name: "companyName", label: "Company name", sample: "MoreYeahs" },
  { name: "companyAddress", label: "Company address", sample: "Indore, Madhya Pradesh" },
  { name: "letterDate", label: "Letter date", sample: "10 July 2026" },
  { name: "signatoryName", label: "Signatory name", sample: "Gourav Chandel" },
  { name: "signatoryDesignation", label: "Signatory designation", sample: "Head of HR" },
  // Special marker: renders the uploaded signature IMAGE at this position
  // (not text). Handled by the PDF renderer, so it is not substituted.
  { name: "signature", label: "Signature image", sample: "" },
];

/** Default body used when an org hasn't customised its offer letter yet. */
export const DEFAULT_OFFER_LETTER_BODY = `{{letterDate}}

{{candidateName}}
{{candidateAddress}}

Subject: Offer of Employment — {{jobTitle}}

Dear {{candidateName}},

We are pleased to offer you the position of {{designation}} at {{companyName}}. We believe your skills and experience will be a valuable addition to our team. The key terms of your employment are set out below.

Designation: {{designation}}
Annual CTC: {{ctc}}
Joining Date: {{joiningDate}}
Department: {{department}}
Reporting Manager: {{reportingManager}}
Offer Valid Until: {{offerValidUntil}}

This offer is contingent upon successful completion of background verification and submission of the required documents. Please sign and return this letter to confirm your acceptance.

We look forward to welcoming you to the team.

Sincerely,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}`;

/** Sample value map for the Settings "Preview sample" render. */
export function sampleFieldValues(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of OFFER_LETTER_FIELDS) m[f.name] = f.sample;
  return m;
}
