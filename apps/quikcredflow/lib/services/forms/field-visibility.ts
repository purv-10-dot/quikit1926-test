/**
 * FR-RE — pure field/tab visibility resolution, lifted out of the disposition
 * modal so the clean FR-RE view and the legacy fallback share ONE implementation
 * (extract-and-reuse, not a rewrite). Given the rule-engine decision, these say
 * what the agent actually sees:
 *   - fieldVisible:  a rule show/hide overrides; otherwise the field's default.
 *   - tabVisible:    an always-tab always shows; a rule-driven tab only when revealed.
 *   - fieldRendered: a field on a hidden tab never renders, even if itself visible.
 */

/** What these helpers read from RuleDecision (a structural subset, kept loose). */
export interface VisibilityDecision {
  fieldVisibility: Record<string, "show" | "hide">;
  tabsToShow: string[];
}

interface VisField {
  fieldKey: string;
  defaultVisibility: string;
  formTabId?: string | null;
}
interface VisTab {
  id: string;
  visibility: string;
}

/** A rule show/hide overrides; otherwise follow the field's defaultVisibility. */
export function fieldVisible(field: VisField, decision: VisibilityDecision | null): boolean {
  const v = decision?.fieldVisibility[field.fieldKey];
  if (v === "show") return true;
  if (v === "hide") return false;
  return field.defaultVisibility !== "hidden";
}

/** Always-tabs always render; rule-driven tabs only when a rule revealed them. */
export function tabVisible(tab: VisTab, decision: VisibilityDecision | null): boolean {
  if (tab.visibility !== "rule_driven") return true;
  return (decision?.tabsToShow ?? []).includes(tab.id);
}

/** A field renders only if its tab (if any) is visible AND the field itself is visible. */
export function fieldRendered(
  field: VisField,
  decision: VisibilityDecision | null,
  tabsById: Map<string, VisTab>,
): boolean {
  const tab = field.formTabId ? tabsById.get(field.formTabId) ?? null : null;
  if (tab && !tabVisible(tab, decision)) return false;
  return fieldVisible(field, decision);
}
