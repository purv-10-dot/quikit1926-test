export const LEAD_FORM_STEPS = [
  { id: "lead-info", label: "Lead Information" },
  { id: "company", label: "Company Information" },
  { id: "contact", label: "Contact Information" },
] as const;

export const LEAD_FORM_STEP_COUNT = LEAD_FORM_STEPS.length;
/** Last wizard content step (Create lead submits here). */
export const LEAD_FORM_LAST_STEP_INDEX = LEAD_FORM_STEP_COUNT - 1;
