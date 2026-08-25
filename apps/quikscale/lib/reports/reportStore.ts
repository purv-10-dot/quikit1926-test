/**
 * Reading and writing generated reports, of every kind.
 *
 * WHY ONE TABLE
 * -------------
 * Four tables held these rows before — one per report kind — and about
 * twenty-four of their thirty columns were byte-identical. The copies had
 * already drifted: `factSet` on two of the four, `completeness` on one. That is
 * what four copies of one contract produces.
 *
 * The pattern is not new here either: `MeetingReportVersion` and
 * `MeetingReportJob` already key on `reportKind` for exactly the same reason.
 *
 * WHAT THIS MODULE IS FOR
 * -----------------------
 * A single table only stays clean if callers do not each invent their own
 * `where` clause. Every read and write goes through here, so the identity rule,
 * the versioning rule and the sign-off-clearing rule are each written once.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type { ReportKind } from "./versions";

export type { ReportKind };

/** The kinds that live in `ClientMeetingReport`. `DH_DAILY` is not one of them. */
export const STORED_REPORT_KINDS = [
  "DH_WEEKLY",
  "WM",
  "WEEK_ROLLUP",
  "MONTHLY",
] as const;

export type StoredReportKind = (typeof STORED_REPORT_KINDS)[number];

/**
 * Identity of a report WITHIN its kind.
 *
 * Period reports key on the ISO period start. WM keys on the meeting id,
 * because a client can hold two weekly meetings on one date and the date alone
 * would not tell the two reports apart. Same convention as
 * `MeetingReportJob.scopeKey`.
 */
export function scopeKeyFor(input: {
  kind: StoredReportKind;
  periodStart?: Date | string | null;
  weeklyMeetingId?: string | null;
}): string {
  if (input.kind === "WM") {
    if (!input.weeklyMeetingId) {
      throw new Error("A WM report needs a weeklyMeetingId to identify it");
    }
    return input.weeklyMeetingId;
  }

  if (!input.periodStart) {
    throw new Error(`A ${input.kind} report needs a periodStart to identify it`);
  }
  return typeof input.periodStart === "string"
    ? input.periodStart.slice(0, 10)
    : input.periodStart.toISOString().slice(0, 10);
}

/** Columns every caller needs. Explicit, so a new column is a deliberate choice. */
const REPORT_SELECT = {
  id: true,
  orgId: true,
  clientId: true,
  reportKind: true,
  scopeKey: true,
  periodStart: true,
  periodEnd: true,
  weeklyMeetingId: true,
  report: true,
  metrics: true,
  validation: true,
  factSet: true,
  reportConfidence: true,
  coveragePct: true,
  completeness: true,
  processingLimitations: true,
  extractionVersion: true,
  sourceFingerprint: true,
  promptVersion: true,
  schemaVersion: true,
  modelId: true,
  tokensInput: true,
  tokensOutput: true,
  costUsd: true,
  currentVersion: true,
  sourceReportIds: true,
  sourceHuddleIds: true,
  sourceTranscriptIds: true,
  missingSources: true,
  validatedAt: true,
  validatedBy: true,
  generatedAt: true,
  generatedBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
} satisfies Prisma.ClientMeetingReportSelect;

export type StoredReport = Prisma.ClientMeetingReportGetPayload<{
  select: typeof REPORT_SELECT;
}>;

/** One report, or null. Soft-deleted rows are never returned. */
export async function findReport(
  orgId: string,
  kind: StoredReportKind,
  scopeKey: string,
): Promise<StoredReport | null> {
  return db.clientMeetingReport.findFirst({
    where: { orgId, reportKind: kind, scopeKey, deletedAt: null },
    select: REPORT_SELECT,
  });
}

export interface ListReportsOptions {
  kinds?: StoredReportKind[];
  /** Inclusive period-start window. */
  from?: Date;
  to?: Date;
}

/**
 * Every report for a client in a window, across kinds.
 *
 * The query that needed four round trips before. A rollup reading "everything
 * that happened this period" is now one indexed read, which is most of the
 * argument for the merge.
 */
export async function listReports(
  orgId: string,
  clientId: string,
  options: ListReportsOptions = {},
): Promise<StoredReport[]> {
  return db.clientMeetingReport.findMany({
    where: {
      orgId,
      clientId,
      deletedAt: null,
      ...(options.kinds ? { reportKind: { in: [...options.kinds] } } : {}),
      ...(options.from || options.to
        ? {
            periodStart: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    select: REPORT_SELECT,
    orderBy: { periodStart: "asc" },
  });
}

/** Everything a generate route supplies. Kind-specific fields are optional. */
export interface UpsertReportInput {
  orgId: string;
  clientId: string;
  kind: StoredReportKind;
  scopeKey: string;
  periodStart: Date;
  periodEnd: Date;
  weeklyMeetingId?: string | null;

  report: unknown;
  metrics: unknown;
  validation?: unknown;
  factSet?: unknown;
  reportConfidence?: number | null;

  coveragePct?: number | null;
  completeness?: string;
  processingLimitations?: unknown;
  extractionVersion?: number | null;

  sourceFingerprint: string;
  promptVersion: string;
  schemaVersion: number;
  modelId?: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;

  sourceReportIds?: string[];
  sourceHuddleIds?: string[];
  sourceTranscriptIds?: string[];
  missingSources?: string[];

  generatedBy: string;
  generatedAt?: Date;
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/**
 * Create or replace a report.
 *
 * Two rules live here rather than in twelve routes:
 *
 *   · regenerating increments `currentVersion` — the previous snapshot is
 *     preserved by `snapshotReportVersion`, so nothing is destroyed;
 *   · regenerating CLEARS the sign-off. A facilitator validated a specific
 *     document; a new one has to be re-earned, and forgetting this in one
 *     route would silently carry approval onto content nobody approved.
 */
export async function upsertReport(input: UpsertReportInput): Promise<StoredReport> {
  const now = input.generatedAt ?? new Date();

  const shared = {
    clientId: input.clientId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    weeklyMeetingId: input.weeklyMeetingId ?? null,
    report: json(input.report),
    metrics: json(input.metrics),
    validation: input.validation === undefined ? undefined : json(input.validation),
    factSet: input.factSet === undefined ? undefined : json(input.factSet),
    reportConfidence: input.reportConfidence ?? null,
    coveragePct: input.coveragePct ?? null,
    completeness: input.completeness ?? "COMPLETE",
    processingLimitations:
      input.processingLimitations === undefined
        ? undefined
        : json(input.processingLimitations),
    extractionVersion: input.extractionVersion ?? null,
    sourceFingerprint: input.sourceFingerprint,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    modelId: input.modelId ?? null,
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    costUsd: input.costUsd ?? 0,
    sourceReportIds: input.sourceReportIds ?? [],
    sourceHuddleIds: input.sourceHuddleIds ?? [],
    sourceTranscriptIds: input.sourceTranscriptIds ?? [],
    missingSources: input.missingSources ?? [],
    generatedAt: now,
    generatedBy: input.generatedBy,
    updatedBy: input.generatedBy,
  };

  return db.clientMeetingReport.upsert({
    where: {
      orgId_reportKind_scopeKey: {
        orgId: input.orgId,
        reportKind: input.kind,
        scopeKey: input.scopeKey,
      },
    },
    create: {
      orgId: input.orgId,
      reportKind: input.kind,
      scopeKey: input.scopeKey,
      currentVersion: 1,
      ...shared,
    },
    update: {
      ...shared,
      currentVersion: { increment: 1 },
      // A regenerated report is unreviewed again.
      validatedAt: null,
      validatedBy: null,
      // A regenerated report is no longer deleted, so a Generate after a delete
      // brings it back rather than writing a row nothing can read.
      deletedAt: null,
    },
    select: REPORT_SELECT,
  });
}

/** Set or clear a report's sign-off. */
export async function setValidated(
  reportId: string,
  input: { validated: boolean; userId: string },
): Promise<{ validatedAt: Date | null; validatedBy: string | null }> {
  return db.clientMeetingReport.update({
    where: { id: reportId },
    data: {
      validatedAt: input.validated ? new Date() : null,
      validatedBy: input.validated ? input.userId : null,
      updatedBy: input.userId,
    },
    select: { validatedAt: true, validatedBy: true },
  });
}

/**
 * Save a human edit to a report body.
 *
 * Only the DH weekly report has an edit path — the other kinds are sign-off
 * only, because every figure in them is computed and an edited number would no
 * longer match its evidence. `currentVersion` is deliberately NOT incremented:
 * a version is a GENERATION, and a human correction to one is part of that
 * generation rather than a new one.
 */
export async function saveReportEdit(
  reportId: string,
  input: {
    report: unknown;
    metrics: unknown;
    reportConfidence?: number | null;
    /** Undefined leaves the sign-off untouched. */
    validated?: boolean;
    userId: string;
  },
): Promise<{ validatedAt: Date | null; validatedBy: string | null }> {
  const now = new Date();
  return db.clientMeetingReport.update({
    where: { id: reportId },
    data: {
      report: json(input.report),
      metrics: json(input.metrics),
      reportConfidence: input.reportConfidence ?? null,
      updatedAt: now,
      updatedBy: input.userId,
      ...(input.validated === undefined
        ? {}
        : input.validated
          ? { validatedAt: now, validatedBy: input.userId }
          : { validatedAt: null, validatedBy: null }),
    },
    select: { validatedAt: true, validatedBy: true },
  });
}

/**
 * Soft-delete a report.
 *
 * Soft, because every report is cheap to rebuild from artefacts that are not
 * deleted — so removing one discards a summary, never data — and because a
 * deletion someone regrets should be recoverable.
 */
export async function softDeleteReport(
  reportId: string,
  userId: string,
): Promise<void> {
  await db.clientMeetingReport.update({
    where: { id: reportId },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
}
