/**
 * Prospect funnel stage ordering.
 *
 * CrmProspect.status is a free-form String (schema default "New"), not an enum.
 * The only values this codebase writes today are:
 *   "New"        — schema default, set when the extension saves a profile
 *                  (POST /api/leads/from-linkedin)
 *   "Converted"  — set by POST /api/settings/prospects/[id]/convert once the
 *                  prospect becomes a CrmLead
 *
 * We deliberately do NOT invent Contacted/Qualified stages here: the funnel is a
 * reporting view over whatever statuses actually exist in the data. KNOWN_ORDER
 * fixes the position of the statuses we know about, and any other value found in
 * the DB is appended (alphabetically) so a status introduced later by the
 * prospect workflow shows up in the funnel with no code change here.
 */

/** Statuses whose funnel position is known, top-of-funnel first. */
export const KNOWN_PROSPECT_STAGES = ["New", "Contacted", "Qualified", "Converted"] as const;

const KNOWN_INDEX = new Map<string, number>(
  KNOWN_PROSPECT_STAGES.map((s, i) => [s.toLowerCase(), i]),
);

/**
 * Order the statuses actually present in the data.
 *
 * Known statuses keep their KNOWN_ORDER position; unknown ones are appended in
 * alphabetical order after them. Only statuses present in `found` are returned —
 * except that "New" and "Converted" are always included (they are the two ends
 * of the funnel and a zero there is meaningful, not noise).
 */
export function orderProspectStages(found: Iterable<string>): string[] {
  const set = new Set<string>(found);
  set.add("New");
  set.add("Converted");

  return [...set].sort((a, b) => {
    const ia = KNOWN_INDEX.get(a.toLowerCase());
    const ib = KNOWN_INDEX.get(b.toLowerCase());
    if (ia !== undefined && ib !== undefined) return ia - ib;
    // Known stages always sort ahead of unknown ones.
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
}
