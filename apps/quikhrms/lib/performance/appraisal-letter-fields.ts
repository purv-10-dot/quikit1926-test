/**
 * Dynamic fields available in the appraisal-letter body template. Client-safe
 * (no server deps) so both the Settings editor (chips) and the PDF renderer
 * (substitution) share one source of truth.
 *
 * Placeholders are written as `{{name}}` in the template body.
 */
export interface AppraisalLetterField {
  name: string;
  label: string;
  /** Sample value used for the Settings "Preview sample" render. */
  sample: string;
}

export const APPRAISAL_LETTER_FIELDS: AppraisalLetterField[] = [
  { name: "employeeName", label: "Employee name", sample: "Aarav Sharma" },
  { name: "firstName", label: "First name", sample: "Aarav" },
  { name: "employeeCode", label: "Employee ID", sample: "EMP-0142" },
  { name: "designation", label: "Designation", sample: "Senior Software Engineer" },
  { name: "department", label: "Department", sample: "Engineering" },
  { name: "appraisalDate", label: "Date of appraisal", sample: "01 August 2026" },
  { name: "effectiveDate", label: "Effective from", sample: "01 August 2026" },
  { name: "revisedCtc", label: "Revised annual CTC", sample: "Rs. 19,80,000" },
  { name: "revisedCtcWords", label: "Revised annual CTC (in words)", sample: "Nineteen Lakh Eighty Thousand Rupees Only" },
  { name: "nextAppraisalMonth", label: "Next appraisal month", sample: "August 2027" },
  { name: "companyName", label: "Company name", sample: "MoreYeahs" },
  { name: "companyAddress", label: "Company address", sample: "Indore, Madhya Pradesh" },
  { name: "letterDate", label: "Letter date", sample: "23 July 2026" },
  { name: "signatoryName", label: "Signatory name", sample: "Gourav Chandel" },
  { name: "signatoryDesignation", label: "Signatory designation", sample: "Head of HR" },
  // Special marker: renders the uploaded signature IMAGE at this position
  // (not text). Handled by the PDF renderer, so it is not substituted.
  { name: "signature", label: "Signature image", sample: "" },
  // Special marker: renders the Annexure A/B salary breakdown TABLE at this
  // position (components, gross, deductions, net, CTC). Handled by the PDF
  // renderer — draws a table, not substituted as text.
  { name: "salaryTable", label: "Salary breakdown table", sample: "" },
];

/** Default body used when an org hasn't customised its appraisal letter yet. */
export const DEFAULT_APPRAISAL_LETTER_BODY = `{{appraisalDate}}
{{employeeName}}
{{designation}}

Performance Appraisal Letter

Dear {{firstName}},

{{companyName}} is pleased to inform you that, in recognition of your performance and contribution to the organization, your annual salary has been revised to {{revisedCtc}} ({{revisedCtcWords}}) per annum with effect from {{effectiveDate}}.

{{companyName}} management appreciates your efforts and commitment. Congratulations, and best wishes for continued success.

Please find the details of revised compensation and benefits below.

{{salaryTable}}

Important points:
1. TDS, PT, and other deductions will be made as per the applicable government norm.
2. You will be eligible for your next performance appraisal in {{nextAppraisalMonth}}. Salary progression may occur subject to your annual performance review and contingent upon company performance and financials.

Many congratulations & best wishes!

Best Regards,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}
`;
