/**
 * Dynamic fields + default bodies for the Relieving Letter and Experience Letter.
 * Client-safe (no server deps) so the Settings editors and the PDF renderer share
 * one source of truth. Placeholders: `{{name}}`.
 */
export interface ExitLetterField { name: string; label: string; sample: string }

export const EXIT_LETTER_FIELDS: ExitLetterField[] = [
  { name: "employeeName", label: "Employee name", sample: "Aarav Sharma" },
  { name: "employeeCode", label: "Employee ID", sample: "EMP-0142" },
  { name: "designation", label: "Designation", sample: "Senior Software Engineer" },
  { name: "department", label: "Department", sample: "Engineering" },
  { name: "joiningDate", label: "Date of joining", sample: "10 January 2018" },
  { name: "lastWorkingDay", label: "Last working day", sample: "30 April 2024" },
  { name: "tenure", label: "Tenure (from → to)", sample: "10 January 2018 to 30 April 2024" },
  { name: "companyName", label: "Company name", sample: "MoreYeahs" },
  { name: "companyAddress", label: "Company address", sample: "Indore, Madhya Pradesh" },
  { name: "letterDate", label: "Letter date", sample: "24 July 2026" },
  { name: "signatoryName", label: "Signatory name", sample: "Gourav Chandel" },
  { name: "signatoryDesignation", label: "Signatory designation", sample: "Head of HR" },
  { name: "signature", label: "Signature image", sample: "" },
];

export const DEFAULT_RELIEVING_LETTER_BODY = `{{letterDate}}

{{employeeName}}
Employee ID: {{employeeCode}}
{{designation}}, {{department}}

Subject: Relieving Letter

Dear {{employeeName}},

This is to confirm that you have been relieved from your duties as {{designation}} at {{companyName}}, effective at the close of business on {{lastWorkingDay}}.

We confirm that you have completed the required notice period and handover formalities, and that all company dues and assets have been settled/returned as per company policy.

We thank you for your services from {{joiningDate}} to {{lastWorkingDay}} and wish you the very best in your future endeavours.

Sincerely,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}`;

export const DEFAULT_EXPERIENCE_LETTER_BODY = `{{letterDate}}

{{employeeName}}
{{designation}}

TO WHOM IT MAY CONCERN

Subject: Work Experience Certificate

This is to certify that {{employeeName}} (Employee ID: {{employeeCode}}) has worked as a {{designation}} with {{companyName}} from {{tenure}}.

During this tenure, {{employeeName}}'s services were found to be satisfactory. They demonstrated strong professional skills, commitment, and dedication to their work.

We found {{employeeName}} to be a valuable member of the {{department}} team, and we wish them the very best in their future endeavours.

Sincerely,

{{signature}}
{{signatoryName}}
{{signatoryDesignation}}
{{companyName}}`;
