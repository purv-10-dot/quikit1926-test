/**
 * Dynamic fields available in the resignation-acceptance-letter body template.
 * Client-safe (no server deps) so both the Settings editor (chips) and the PDF
 * renderer (substitution) share one source of truth. Placeholders: `{{name}}`.
 */
export interface ResignationLetterField {
  name: string;
  label: string;
  sample: string;
}

export const RESIGNATION_LETTER_FIELDS: ResignationLetterField[] = [
  { name: "employeeName", label: "Employee name", sample: "Aarav Sharma" },
  { name: "employeeCode", label: "Employee ID", sample: "EMP-0142" },
  { name: "designation", label: "Designation", sample: "Senior Software Engineer" },
  { name: "department", label: "Department", sample: "Engineering" },
  { name: "resignationDate", label: "Resignation date", sample: "10 July 2026" },
  { name: "lastWorkingDay", label: "Last working day", sample: "08 September 2026" },
  { name: "noticePeriod", label: "Notice period", sample: "60 days" },
  { name: "companyName", label: "Company name", sample: "MoreYeahs" },
  { name: "companyAddress", label: "Company address", sample: "Indore, Madhya Pradesh" },
  { name: "letterDate", label: "Letter date", sample: "23 July 2026" },
  { name: "signatoryName", label: "Signatory name", sample: "Gourav Chandel" },
  { name: "signatoryDesignation", label: "Signatory designation", sample: "Head of HR" },
  // Special marker: renders the uploaded signature IMAGE at this position.
  { name: "signature", label: "Signature image", sample: "" },
];

/** Default body used when an org hasn't customised its resignation letter yet. */
export const DEFAULT_RESIGNATION_LETTER_BODY = `{{letterDate}}

{{employeeName}}
Employee ID: {{employeeCode}}
{{designation}}, {{department}}

Subject: Acceptance of Resignation

Dear {{employeeName}},

This is with reference to your resignation dated {{resignationDate}}. We acknowledge and formally accept your resignation from the position of {{designation}} at {{companyName}}.

Resignation Date: {{resignationDate}}
Notice Period: {{noticePeriod}}
Last Working Day: {{lastWorkingDay}}

You are requested to complete the knowledge transfer and obtain clearance from all relevant departments (IT, Finance, Admin) before your last working day. Your full and final settlement will be processed as per company policy.

We thank you for your contributions and wish you the very best in your future endeavours.

Sincerely,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}`;
