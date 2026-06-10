/** Past-tense verbs for user-facing action toasts. */
export type ToastActionVerb = "create" | "update" | "delete" | "save" | "remove";

const PAST_TENSE: Record<ToastActionVerb, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  save: "saved",
  remove: "removed",
};

/** e.g. "Task created successfully" */
export function actionSuccessMessage(entity: string, verb: ToastActionVerb): string {
  const label = entity.trim();
  return `${label} ${PAST_TENSE[verb]} successfully`;
}

/** e.g. "Failed to create task" or with API detail appended */
export function actionFailedMessage(
  entity: string,
  verb: ToastActionVerb,
  detail?: string | null,
): string {
  const noun = entity.trim().toLowerCase();
  const base = `Failed to ${verb} ${noun}`;
  const d = detail?.trim();
  if (!d) return base;
  return `${base}: ${d}`;
}
