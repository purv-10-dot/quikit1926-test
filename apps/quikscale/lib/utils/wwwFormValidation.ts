/**
 * Pure validation for the WWW add/edit form. Extracted from WWWPanel so the
 * rules can be unit-tested without rendering the drawer (and reused by both
 * create + edit modes).
 *
 * `notesRequired` mirrors the org's `www_notes_required` config flag: when on,
 * the Notes field is mandatory (add AND edit). When off, Notes stays optional —
 * preserving today's behaviour.
 */

export interface WWWFormValues {
  whoIds: string[];
  what: string;
  when: string;
  /** Edit-mode only; ignored on create. */
  revisedDate?: string;
  notes: string;
}

export interface WWWValidateOptions {
  mode: "create" | "edit";
  /** Org flag `www_notes_required`. */
  notesRequired: boolean;
}

/** Returns a field→message map; empty object means the form is valid. */
export function validateWWWForm(
  form: WWWFormValues,
  opts: WWWValidateOptions,
): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!form.whoIds || form.whoIds.length === 0) {
    errs.whoIds = "At least one assignee is required";
  }
  if (!form.what.trim()) errs.what = "What is required";
  if (!form.when) errs.when = "When is required";

  // Edit mode only: revised date must not be earlier than When.
  if (opts.mode === "edit" && form.revisedDate && form.when && form.revisedDate < form.when) {
    errs.revisedDate = "Revised date cannot be earlier than When";
  }

  // Org-configurable: Notes required (whitespace-only does not count).
  if (opts.notesRequired && !form.notes.trim()) {
    errs.notes = "Notes are required";
  }

  return errs;
}
