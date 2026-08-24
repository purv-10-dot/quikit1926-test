/**
 * Report version snapshots.
 *
 * Every generation writes an immutable copy of the report JSON alongside the
 * cache key it was produced under. That is what makes *"why did the report say
 * this in August?"* answerable months later, after the transcripts have been
 * re-extracted and the prompt has moved on twice.
 *
 * ONE TABLE FOR EVERY REPORT KIND
 * -------------------------------
 * `MeetingReportVersion` is discriminated by `reportKind` rather than mirrored
 * per report type. A fourth report kind is then a new composer, not new
 * infrastructure — and the retention, listing and diffing logic is written
 * once.
 *
 * `reportId` is deliberately NOT a foreign key: the owning table varies by
 * kind, and a snapshot has to outlive a hard-deleted report or the question it
 * exists to answer becomes unanswerable exactly when it is most likely to be
 * asked.
 *
 * BEST-EFFORT BY DESIGN
 * ---------------------
 * A snapshot failure must never fail the generation the user is waiting for.
 * Losing a history entry is a nuisance; losing the report the user just paid
 * for is not. Failures are logged and swallowed, matching the contract of
 * `lib/audit/audit.ts` and `AiUsageLog`.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/** Versions kept per report. Older ones are pruned after each write. */
export const VERSION_RETENTION = 10;

export type ReportKind = "DH_WEEKLY" | "DH_DAILY" | "WM" | "MONTHLY";

export interface SnapshotInput {
  orgId: string;
  clientId?: string | null;
  reportKind: ReportKind;
  /** Row id on the owning report table. */
  reportId: string;
  report: unknown;
  metrics: unknown;
  validation?: unknown;
  sourceFingerprint?: string | null;
  promptVersion?: string | null;
  schemaVersion?: number;
  modelId?: string | null;
  extractionVersion?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  costUsd?: number | null;
  coveragePct?: number | null;
  generatedBy: string;
}

/**
 * Write a snapshot and prune old ones.
 *
 * The version number is derived from what already exists rather than passed in,
 * so a caller cannot accidentally overwrite history by reusing a number. Two
 * concurrent generations would be prevented upstream by the
 * `MeetingReportJob` lock; if one ever slipped through, the unique constraint
 * on `(reportKind, reportId, version)` turns it into a caught, logged failure
 * rather than a silent overwrite.
 */
export async function snapshotReportVersion(input: SnapshotInput): Promise<number | null> {
  try {
    const latest = await db.meetingReportVersion.findFirst({
      where: { reportKind: input.reportKind, reportId: input.reportId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    await db.meetingReportVersion.create({
      data: {
        orgId: input.orgId,
        clientId: input.clientId ?? null,
        reportKind: input.reportKind,
        reportId: input.reportId,
        version,
        report: input.report as Prisma.InputJsonValue,
        metrics: input.metrics as Prisma.InputJsonValue,
        validation: (input.validation ?? undefined) as Prisma.InputJsonValue | undefined,
        sourceFingerprint: input.sourceFingerprint ?? null,
        promptVersion: input.promptVersion ?? null,
        schemaVersion: input.schemaVersion ?? 1,
        modelId: input.modelId ?? null,
        extractionVersion: input.extractionVersion ?? null,
        tokensInput: input.tokensInput ?? null,
        tokensOutput: input.tokensOutput ?? null,
        costUsd: input.costUsd ?? null,
        coveragePct: input.coveragePct ?? null,
        generatedBy: input.generatedBy,
      },
    });

    await pruneVersions(input.reportKind, input.reportId);
    return version;
  } catch (err) {
    // Never fail the generation for a history write.
    console.error(
      `[reports:versions] failed to snapshot ${input.reportKind}/${input.reportId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Keep the most recent `VERSION_RETENTION` versions.
 *
 * Reports are JSONB documents of real size; an unbounded history would make the
 * table the largest object in the schema within a year for no benefit — nobody
 * asks why a report said something eleven regenerations ago.
 */
async function pruneVersions(reportKind: string, reportId: string): Promise<void> {
  const keep = await db.meetingReportVersion.findMany({
    where: { reportKind, reportId },
    orderBy: { version: "desc" },
    take: VERSION_RETENTION,
    select: { id: true },
  });
  if (keep.length < VERSION_RETENTION) return;

  await db.meetingReportVersion.deleteMany({
    where: { reportKind, reportId, id: { notIn: keep.map((k) => k.id) } },
  });
}

export interface VersionSummary {
  version: number;
  generatedAt: Date;
  generatedBy: string;
  sourceFingerprint: string | null;
  promptVersion: string | null;
  schemaVersion: number;
  coveragePct: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
}

/** Version history for one report, newest first. Metadata only — no payloads. */
export async function listReportVersions(
  orgId: string,
  reportKind: ReportKind,
  reportId: string,
): Promise<VersionSummary[]> {
  return db.meetingReportVersion.findMany({
    where: { orgId, reportKind, reportId },
    orderBy: { version: "desc" },
    select: {
      version: true,
      generatedAt: true,
      generatedBy: true,
      sourceFingerprint: true,
      promptVersion: true,
      schemaVersion: true,
      coveragePct: true,
      tokensInput: true,
      tokensOutput: true,
    },
  });
}

/** One historical snapshot, including its payload. Always org-scoped. */
export async function getReportVersion(
  orgId: string,
  reportKind: ReportKind,
  reportId: string,
  version: number,
) {
  return db.meetingReportVersion.findFirst({
    where: { orgId, reportKind, reportId, version },
  });
}
