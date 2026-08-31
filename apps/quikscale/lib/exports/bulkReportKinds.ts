/**
 * The report kinds a bulk download covers, and their human labels.
 *
 * SEPARATE FROM `bulkReportZip.ts`, AND WITH NO VALUE IMPORTS, ON PURPOSE.
 * The download dialog needs these constants and nothing else. Importing them
 * from the zip builder would drag react-pdf and jszip into the client bundle,
 * and importing the kind list from `reportStore` would drag Prisma in with it -
 * both server-only, both large. A module with type-only imports compiles to
 * three plain objects.
 *
 * TWO STORAGE HOMES, ONE LIST
 * ---------------------------
 * `DH_DAILY` is the report for ONE huddle and lives on
 * `ClientMeetingTranscript.report`; the other four are period/meeting reports in
 * `ClientMeetingReport`. That split is a fact about the schema, not something a
 * person choosing downloads should have to know, so both appear in one list here
 * and `TRANSCRIPT_SOURCED_KINDS` tells the server where to look.
 */

import type { StoredReportKind } from "@/lib/reports/reportStore";

/**
 * Ordered as the meeting rhythm runs - one huddle, the huddle week, the weekly
 * meeting, the week across both, the month - because that is the order people
 * think in when they pick what to download.
 */
export const BULK_REPORT_KINDS = [
  "DH_DAILY",
  "DH_WEEKLY",
  "WM",
  "WEEK_ROLLUP",
  "MONTHLY",
] as const;

export type BulkReportKind = (typeof BULK_REPORT_KINDS)[number];

/**
 * Fails to compile if a kind is ever added to `ClientMeetingReport` without
 * being made downloadable - which would leave a report people can generate and
 * read but cannot export, with nothing to point at the omission.
 */
type AssertStoredKindsCovered = StoredReportKind extends BulkReportKind ? true : never;
const assertStoredKindsCovered: AssertStoredKindsCovered = true;
void assertStoredKindsCovered;

/** Kinds read from `ClientMeetingTranscript` rather than `ClientMeetingReport`. */
export const TRANSCRIPT_SOURCED_KINDS = ["DH_DAILY"] as const satisfies readonly BulkReportKind[];

export type TranscriptSourcedKind = (typeof TRANSCRIPT_SOURCED_KINDS)[number];

export const isTranscriptSourced = (kind: BulkReportKind): kind is TranscriptSourcedKind =>
  (TRANSCRIPT_SOURCED_KINDS as readonly string[]).includes(kind);

export const BULK_KIND_LABEL: Record<BulkReportKind, string> = {
  DH_DAILY: "Daily Huddle Report (one huddle)",
  DH_WEEKLY: "Daily Huddle Weekly Report",
  WM: "Weekly Meeting Report",
  WEEK_ROLLUP: "Week Rollup Report",
  MONTHLY: "Monthly Report",
};

/** File-name prefix per kind, matching the single-report download routes. */
export const BULK_KIND_FILE_PREFIX: Record<BulkReportKind, string> = {
  DH_DAILY: "Daily-Huddle",
  DH_WEEKLY: "Daily-Huddle-Weekly",
  WM: "Weekly-Meeting-Report",
  WEEK_ROLLUP: "Week-Rollup",
  MONTHLY: "Monthly-Report",
};

/**
 * Kinds that carry a facilitator sign-off.
 *
 * A per-huddle report has no sign-off step at all, so "signed-off only" cannot
 * include one. Filtering it out silently would look like the huddle had no
 * report; the dialog says so instead.
 */
export const SIGN_OFF_KINDS: readonly BulkReportKind[] = [
  "DH_WEEKLY",
  "WM",
  "WEEK_ROLLUP",
  "MONTHLY",
];
