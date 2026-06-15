/**
 * KPI-specific audit field configuration.
 *
 * Kept out of the generic engine (diff/actions/audit) so the engine stays
 * entity-agnostic. Shared by the KPI capture points (which fields to diff) and
 * the Change History panel (how to label fields in the timeline).
 */

/**
 * Derived / system-managed fields that should NOT appear as user-facing
 * changes in the timeline. Everything else on a KPI is diffed by default, so
 * newly added editable fields are captured automatically.
 *
 * Note: `lastNotes` is intentionally NOT excluded — editing the headline note
 * is a meaningful, user-visible change (see the design's "Last Notes" diff).
 */
export const KPI_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "progressPercent",
  "healthStatus",
  "qtdAchieved",
  "currentWeekValue",
  "lastNotesAt",
  "lastNotedBy",
  "parentKPIId",
] as const;

/** Human-readable labels for KPI fields shown in the Change History timeline. */
export const KPI_FIELD_LABELS: Record<string, string> = {
  name: "KPI Name",
  description: "Description",
  kpiLevel: "KPI Level",
  owner: "Owner",
  ownerIds: "Owners",
  ownerContributions: "Owner Split",
  teamId: "Team",
  quarter: "Quarter",
  year: "Year",
  measurementUnit: "Measurement Unit",
  target: "Target",
  quarterlyGoal: "Quarterly Goal",
  qtdGoal: "QTD Goal",
  status: "Status",
  divisionType: "Division Type",
  weeklyTargets: "Weekly Targets",
  weeklyOwnerTargets: "Owner Weekly Targets",
  currency: "Currency",
  targetScale: "Target Scale",
  reverseColor: "Reverse Color",
  frequency: "Frequency",
  lastNotes: "Last Notes",
};

/**
 * The whitelist of user-editable KPI fields to diff on UPDATE. Derived from the
 * label map so adding a labelled field automatically makes it auditable.
 * Using a whitelist (rather than excluding derived fields) keeps the diff
 * immune to differing `select` projections between the before/after rows.
 */
export const KPI_AUDIT_FIELDS = Object.keys(KPI_FIELD_LABELS);

/** Friendly label for a KPI field name, falling back to the raw key. */
export function kpiFieldLabel(field: string): string {
  return KPI_FIELD_LABELS[field] ?? field;
}
