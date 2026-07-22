import { z } from "zod";

/**
 * Allowed table keys for per-user table preferences. All keys live as rows
 * in the `UserTablePreference` table (app_quikscale schema). The legacy
 * User.kpi[Field], priority[Field], and www[Field] columns are kept for
 * rollback safety but no longer read by the app — backfilled at migration
 * time, see 20260527172915_user_table_preference/migration.sql.
 */
export const TABLE_PREFERENCE_KEYS = [
  "kpi",
  "priority",
  "www",
  "clientMaster",
  "clientMembers",
  "dailyHuddle",
  "weeklyMeeting",
  // Master-data grids migrated onto the shared <FeatureGrid> stack.
  "categories",
  "units",
  // OPSP Review tables (DataTable + useDataTableGrid column features).
  "opspReviewPrimary",
  "opspReviewSecondary",
  // OPSP Critical # Review cards — column show/hide only (card layout).
  "opspReviewCritical",
] as const;
export type TablePreferenceKey = (typeof TABLE_PREFERENCE_KEYS)[number];

export const updateTablePreferencesSchema = z.object({
  table: z.enum(TABLE_PREFERENCE_KEYS),
  frozenCol: z.string().nullable().optional(),
  hiddenCols: z.array(z.string()).nullable().optional(),
  sort: z.string().nullable().optional(), // format: "colKey:asc" | "colKey:desc"
  colWidths: z.record(z.string(), z.number()).nullable().optional(),
  // Drag-and-drop column order — array of column keys. Null clears back to
  // the table's default order.
  colOrder: z.array(z.string()).nullable().optional(),
});
