/**
 * Single source of truth for the one-line headline shown for a lead activity in
 * the timeline. Both the renderer (components/leads/lead-activity-timeline.tsx)
 * and the Stage 3-A integration test import THIS function, so the test asserts
 * the real composition — there is no separate mirror to drift.
 *
 * Disposition-related entries (FR-RE Stage 3-A/3-D) — type "Call" and
 * "LeadStageChange": the subject is already the full, clean label
 * ("Call Disposition - <Status>", "Disposition update · <Status>") and outcome
 * is empty, so we render the subject ALONE — no type prefix and no outcome
 * suffix (which would otherwise double up to "Call · Call Disposition - …").
 *
 * Every OTHER (non-system) entry — Quote/Order/Opportunity/Task/Invoice/etc. —
 * keeps the generic "type · subject · outcome" composition unchanged (Stage 3-D
 * Option B: subject-first is scoped to the two disposition types only).
 */
export interface HeadlineActivity {
  type: string;
  subject: string | null;
  outcome: string | null;
}

/** The disposition-flow activity types whose subject is already the clean label. */
const SUBJECT_FIRST_TYPES = new Set(["Call", "LeadStageChange"]);

export function activityHeadline(a: HeadlineActivity): string {
  if (SUBJECT_FIRST_TYPES.has(a.type)) {
    return a.subject?.trim() || a.type;
  }
  return `${a.type}${a.subject ? ` · ${a.subject}` : ""}${a.outcome ? ` · ${a.outcome}` : ""}`;
}
