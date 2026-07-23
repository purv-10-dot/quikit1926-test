/**
 * Variable validation for tenant-uploaded email templates.
 *
 * A tenant may use any `{{variable}}` placeholder in an override's subject/body,
 * but only the variables the event actually provides. Unknown variables are
 * rejected on save so a template never renders a broken/blank token by mistake.
 *
 * Shared by the save API route (server enforcement) and the settings UI (live
 * client-side feedback) so both apply identical rules.
 */

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Distinct `{{token}}` names referenced in a string. */
export function extractTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) out.add(m[1]);
  return [...out];
}

/**
 * Variables referenced in subject/body that are NOT in the allowed set.
 * Returns a de-duplicated, sorted list (empty = all good).
 */
export function findUnknownVars(subject: string, body: string, allowed: Set<string>): string[] {
  const used = new Set([...extractTokens(subject), ...extractTokens(body)]);
  return [...used].filter((name) => !allowed.has(name)).sort();
}
