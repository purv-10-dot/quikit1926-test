// Unsaved Description edits are kept here (localStorage, shared across
// same-origin tabs) so opening an issue in a new tab — before hitting Save —
// shows the pending edit instead of the last-saved server value.
const PREFIX = "qt:description-draft:";

function draftKey(issueId: string): string {
  return `${PREFIX}${issueId}`;
}

export function readDescriptionDraft(issueId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(draftKey(issueId));
}

export function writeDescriptionDraft(issueId: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(issueId), value);
}

export function clearDescriptionDraft(issueId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(issueId));
}
