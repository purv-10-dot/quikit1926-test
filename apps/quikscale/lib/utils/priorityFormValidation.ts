/**
 * Pure validation for the Add Priority form. Extracted from PriorityModal so
 * the rules can be unit-tested without rendering the drawer.
 *
 * The Add form supports multiple owners (`ownerIds`) — the server fans out one
 * Priority row per owner — so the owner rule requires at least one selection.
 */

export interface PriorityFormValues {
  name: string;
  ownerIds: string[];
  quarter: string;
  startWeek: string;
  endWeek: string;
}

/** Returns a field→message map; empty object means the form is valid. */
export function validatePriorityForm(
  form: PriorityFormValues,
): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!form.name.trim()) errs.name = "Priority name is required";
  if (!form.ownerIds || form.ownerIds.length === 0) {
    errs.ownerIds = "At least one owner is required";
  }
  if (!form.quarter) errs.quarter = "Quarter is required";
  if (!form.startWeek) errs.startWeek = "Start week is required";
  if (!form.endWeek) errs.endWeek = "End week is required";

  const sw = parseInt(form.startWeek);
  const ew = parseInt(form.endWeek);
  if (sw && ew && sw > ew) errs.endWeek = "End week must be >= start week";

  return errs;
}
