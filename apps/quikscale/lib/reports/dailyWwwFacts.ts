/**
 * Projecting a Daily Huddle's extracted WWW candidates into `MeetingWwwFact`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Daily Huddle weekly report is built from per-day AI reports stored on
 * `ClientMeetingTranscript.report`. The Weekly Meeting report is built from the
 * fact tables. WWW Review and New WWW read facts — so on the Daily Huddle side
 * there was nothing to read, and neither section could exist there at all.
 *
 * WHY PROJECT RATHER THAN RUN THE CHUNK EXTRACTOR
 * -----------------------------------------------
 * The obvious move is to run `prepareTranscript` + `runExtraction` for each day.
 * It was rejected for two reasons:
 *
 *   1. COST. The daily report ALREADY extracts WWW candidates — who, what, when
 *      and a `sourceQuote` — in a call that has already been paid for. A second
 *      extraction pass would buy the same information twice, doubling the model
 *      cost of every weekly generate.
 *
 *   2. ONE TRUTH. The Daily tab shows the user a list of commitments from that
 *      huddle. If the weekly report extracted its own, independently, the two
 *      screens would eventually disagree about what the team committed to — and
 *      nobody could say which was right.
 *
 * So the daily report stays the single extraction for a huddle, and this module
 * carries its output into the shape the WWW sections read.
 *
 * EVIDENCE IS STILL VERIFIED
 * --------------------------
 * The concern with reusing the daily report is that its quotes were never
 * checked against the transcript. They are checked here — `normaliseForCompare`
 * plus a substring test, the same comparison the chunk pipeline's verifier
 * makes, at zero token cost.
 *
 * An unverified quote does NOT drop the candidate: the user can already see it
 * in the Daily tab, and silently showing fewer commitments in the weekly report
 * would be its own inconsistency. Instead the fact is stored with NO evidence,
 * so WWW Review renders "No update captured" rather than printing words as
 * though somebody said them verbatim.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { normalizeKey } from "@/lib/facts/consolidate";
import { normaliseForCompare } from "@/lib/ai/evidenceVerifier";
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";

export interface ProjectionResult {
  created: number;
  /** Already projected on an earlier pass — the operation is idempotent. */
  skipped: number;
  /** Candidates whose quote could not be found in the transcript. */
  unverified: number;
}

const EMPTY: ProjectionResult = { created: 0, skipped: 0, unverified: 0 };

/** `MISSING_*` mirrors `WWW_COMPLETENESS` in `lib/facts/schemas.ts`. */
function completenessOf(who: string | null, what: string, whenMissing: boolean): string {
  const missing = [!who && "WHO", !what.trim() && "WHAT", whenMissing && "WHEN"].filter(
    Boolean,
  ) as string[];
  if (missing.length === 0) return "COMPLETE";
  if (missing.length > 1) return "MISSING_MULTIPLE";
  return `MISSING_${missing[0]}`;
}

/**
 * Project one transcript's stored daily report into facts.
 *
 * Idempotent on `(orgId, transcriptId, normalizedKey)`: re-running after a
 * regenerate neither duplicates a commitment nor resurrects one a human has
 * since dismissed.
 */
export async function projectDailyWwwFacts(
  orgId: string,
  transcriptId: string,
): Promise<ProjectionResult> {
  const transcript = await db.clientMeetingTranscript.findFirst({
    where: { id: transcriptId, orgId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      meetingDate: true,
      type: true,
      rawText: true,
      report: true,
      reportGeneratedAt: true,
    },
  });
  if (!transcript?.report) return EMPTY;

  const report = transcript.report as unknown as StoredMeetingReport;
  const candidates = report.extractedItems?.wwws ?? [];
  if (candidates.length === 0) return EMPTY;

  // Existing keys, so a re-run is a no-op rather than a second copy of every
  // commitment. Dismissed and merged rows count as existing: the point is that
  // this candidate has already been dealt with.
  const existing = await db.meetingWwwFact.findMany({
    where: { orgId, transcriptId },
    select: { normalizedKey: true },
  });
  const seen = new Set(existing.map((f) => f.normalizedKey));

  const haystack = normaliseForCompare(transcript.rawText ?? "");
  const rows: Prisma.MeetingWwwFactCreateManyInput[] = [];
  let skipped = 0;
  let unverified = 0;

  for (const c of candidates) {
    const what = (c.what ?? "").trim();
    if (!what) continue;

    const normalizedKey = normalizeKey(what);
    if (!normalizedKey || seen.has(normalizedKey)) {
      skipped += 1;
      continue;
    }
    // Guard within this batch too: one huddle can mention the same commitment
    // twice, and both would otherwise become facts.
    seen.add(normalizedKey);

    const quote = c.sourceQuote?.trim() || null;
    const verified = quote ? haystack.includes(normaliseForCompare(quote)) : false;
    if (quote && !verified) unverified += 1;

    const who = c.who?.trim() || null;
    const whenText = c.when?.trim() || null;

    rows.push({
      orgId,
      clientId: transcript.clientId,
      transcriptId,
      meetingDate: transcript.meetingDate,
      cadence: transcript.type ?? "DAILY",
      whoRaw: who,
      what,
      normalizedKey,
      whenText,
      whenMissing: !whenText,
      completeness: completenessOf(who, what, !whenText),
      // Only a quote we found in the transcript is stored. An unverified one is
      // dropped rather than rendered as something a person said.
      evidence: verified ? [{ quote, transcriptSegmentIds: [] }] : [],
      confidence: typeof c.confidence === "number" ? c.confidence : 0,
      // Provenance: these came from the daily report, not the chunk extractor.
      promptVersion: "daily-report-projection@1",
    });
  }

  if (rows.length === 0) return { created: 0, skipped, unverified };

  await db.meetingWwwFact.createMany({ data: rows });
  return { created: rows.length, skipped, unverified };
}

/**
 * Project every transcript in a week.
 *
 * Failure of one day never sinks the week — a huddle whose projection throws is
 * reported and skipped, exactly as the daily-report backfill already treats a
 * day it cannot generate.
 */
export async function projectWeekWwwFacts(
  orgId: string,
  transcriptIds: string[],
): Promise<ProjectionResult & { failures: string[] }> {
  let created = 0;
  let skipped = 0;
  let unverified = 0;
  const failures: string[] = [];

  for (const id of transcriptIds) {
    try {
      const r = await projectDailyWwwFacts(orgId, id);
      created += r.created;
      skipped += r.skipped;
      unverified += r.unverified;
    } catch {
      failures.push(id);
    }
  }

  return { created, skipped, unverified, failures };
}
