/**
 * Canned report catalog — single source of truth.
 *
 * The catalog is split across category files for reviewability; this
 * file stitches them together and exposes:
 *
 *   - `CANNED_REPORTS`        — all 15 reports, in catalog order
 *   - `getCannedReport(id)`   — lookup by id
 *   - `summariseCanned(r)`    — strip non-serialisable callbacks for the
 *                               `GET /api/reports/canned` listing endpoint
 */
import { ACTIVITY_REPORTS } from "./activities";
import { LEAD_REPORTS } from "./leads";
import { PIPELINE_REPORTS } from "./pipeline";
import { TEAM_REPORTS } from "./team";
import { TELEPHONY_REPORTS } from "./telephony";
import type { CannedReport, CannedReportSummary } from "./types";

export const CANNED_REPORTS: CannedReport[] = [
  ...PIPELINE_REPORTS,
  ...LEAD_REPORTS,
  ...ACTIVITY_REPORTS,
  ...TELEPHONY_REPORTS,
  ...TEAM_REPORTS,
];

export function getCannedReport(id: string): CannedReport | undefined {
  return CANNED_REPORTS.find((r) => r.id === id);
}

export function summariseCanned(r: CannedReport): CannedReportSummary {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    blurb: r.blurb,
    helpText: r.helpText ?? r.blurb,
    defaultDateRange: r.defaultDateRange,
  };
}

export type { CannedReport, CannedReportSummary, CannedReportResult, ReportRunContext } from "./types";
