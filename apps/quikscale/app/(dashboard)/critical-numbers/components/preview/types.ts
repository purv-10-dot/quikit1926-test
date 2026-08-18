/**
 * Minimal structural shape shared by `CategoryTierChart`, `PerformanceSummaryCard`,
 * `CriticalNumbersTable`, and `RecentUpdatesCard` — just the fields those
 * components actually read, not tied to `MockCriticalNumber`. `MockCriticalNumber`
 * (extra fields ignored) and a real `CriticalNumberRow` (mapped: `category?.name`
 * → `categoryName`, `updates` → `history`) both satisfy it without a wrapper type.
 * Same technique already applied to `ComboTrendChart`'s own `ComboTrendChartRecord`.
 */

import type { CriticalNumberFrequency, MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";

export interface PreviewUpdateEntry {
  date: string;
  value: number;
  comment?: string | null;
  /** Display name, not a raw user id — resolve before mapping into this shape. */
  createdBy?: string;
}

export interface PreviewCriticalNumber {
  id: string;
  title: string;
  categoryName: string;
  subCategoryName: string | null;
  /** "Department" in the UI — QsTeam fulfils that role (see the schema note
   *  on CriticalNumber.teamId). Used by the by-category/by-department toggle. */
  teamName: string;
  frequency: CriticalNumberFrequency;
  measurementUnit: MeasurementUnit;
  unit: string | null;
  currency: string | null;
  targetScale: string | null;
  targetValue: number;
  currentValue: number | null;
  /** Oldest-first. */
  history: PreviewUpdateEntry[];
}
