/**
 * Dynamic fields available in the joining-letter (appointment letter) body
 * template. Client-safe (no server deps) so both the Branding settings editor
 * (chips) and the PDF renderer (substitution) share one source of truth.
 *
 * Placeholders are written as `{{name}}` in the template body.
 */
export interface JoiningLetterField {
  name: string;
  label: string;
  /** Sample value used for the Settings "Preview sample" render. */
  sample: string;
}

export const JOINING_LETTER_FIELDS: JoiningLetterField[] = [
  { name: "employeeName", label: "Employee name", sample: "Aarav Sharma" },
  { name: "employeeCode", label: "Employee ID", sample: "EMP-0142" },
  { name: "jobTitle", label: "Job title", sample: "Senior Software Engineer" },
  { name: "designation", label: "Designation", sample: "Senior Software Engineer" },
  { name: "department", label: "Department", sample: "Engineering" },
  { name: "reportingManager", label: "Reporting manager", sample: "Priya Nair" },
  { name: "joiningDate", label: "Date of joining", sample: "01 August 2026" },
  { name: "ctc", label: "Annual CTC", sample: "Rs. 18,00,000" },
  { name: "workLocation", label: "Work location", sample: "Indore (Office)" },
  { name: "companyName", label: "Company name", sample: "MoreYeahs" },
  { name: "companyAddress", label: "Company address", sample: "Indore, Madhya Pradesh" },
  { name: "letterDate", label: "Letter date", sample: "23 July 2026" },
  { name: "signatoryName", label: "Signatory name", sample: "Gourav Chandel" },
  { name: "signatoryDesignation", label: "Signatory designation", sample: "Head of HR" },
  // Special marker: renders the uploaded signature IMAGE at this position
  // (not text). Handled by the PDF renderer, so it is not substituted.
  { name: "signature", label: "Signature image", sample: "" },
];

/** Default body used when an org hasn't customised its joining letter yet. */
export const DEFAULT_JOINING_LETTER_BODY = `{{letterDate}}

{{employeeName}}
Employee ID: {{employeeCode}}

Subject: Letter of Appointment — {{designation}}

Dear {{employeeName}},

We are delighted to confirm your appointment as {{designation}} at {{companyName}}, effective {{joiningDate}}. We are confident that your skills and experience will be a valuable addition to our team, and we look forward to a long and rewarding association.

The principal terms of your employment are set out below.

Designation: {{designation}}
Department: {{department}}
Reporting Manager: {{reportingManager}}
Date of Joining: {{joiningDate}}
Work Location: {{workLocation}}
Annual CTC: {{ctc}}

Your employment is governed by the company's policies, as amended from time to time. Please report to the HR team on your joining date with the required documents.

We warmly welcome you to the team.

Sincerely,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}
`;
