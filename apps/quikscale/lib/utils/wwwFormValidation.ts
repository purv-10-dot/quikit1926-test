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
  /**
   * "To Be Decided" due date. When true, `when` may be blank — the user has
   * explicitly deferred the date instead of picking one.
   */
  dueDateTBD?: boolean;
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
  // Due date: EITHER a picked date OR the To-Be-Decided flag. Marking TBD
  // satisfies the requirement, so the date input may be left blank.
  if (!form.when && !form.dueDateTBD) {
    errs.when = "Select a due date or mark it To Be Decided";
  }

  // Edit mode only: revised date must not be earlier than When. Skipped for TBD
  // items — there is no due date to compare against.
  if (
    opts.mode === "edit" &&
    !form.dueDateTBD &&
    form.revisedDate &&
    form.when &&
    form.revisedDate < form.when
  ) {
    errs.revisedDate = "Revised date cannot be earlier than When";
  }

  // Org-configurable: Notes required (whitespace-only does not count). Used by
  // the create form's single Notes textarea. In edit mode notes live in the
  // thread, so the requirement is enforced separately (a new note per save) —
  // the caller passes notesRequired=false for edit.
  if (opts.notesRequired && !form.notes.trim()) {
    errs.notes = "Notes are required";
  }

  return errs;
}
