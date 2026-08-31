import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import {
  generateMeetingReport,
  MeetingReportError,
  type ReportTranscriptInput,
  type StoredMeetingReport,
  type DuplicateRef,
} from "@/lib/ai/meetingReport";
import { findSemanticDuplicate, type KpiCandidate } from "@/lib/ai/semanticKpiMatch";
import { GeminiUnavailableError } from "@/lib/ai/geminiKeyPool";
import {
  diffAttendance,
  formatDurationLabel,
  formatMeetingDateLabel,
  inferTimeOfDay,
} from "@/lib/ai/dailyAdherenceFormat";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

// Bound candidate sets and total semantic calls so a pathological org / noisy
// transcript can't blow up the prompt or the Gemini quota.
const CANDIDATE_CAP = 300;
/**
 * Semantic duplicate-check calls allowed per report.
 *
 * Deliberately small. Each one is a separate model request, and the Gemini free
 * tier allows ~20 requests per window per project — so the old budget of 20
 * meant ONE report could exhaust the quota by itself, and the next generate
 * (or the next user) got "AI is temporarily unavailable". Exact-name matching
 * is free and unbounded; this budget only buys fuzzy matches for the first few
 * items, and running out degrades to exact-only rather than failing.
 */
const SEMANTIC_BUDGET = 6;

type Candidate = { id: string; name: string; ownerName: string | null };
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Tag each extracted item with the existing record it duplicates (if any):
 * deterministic exact-name match first, then a bounded semantic pass. Semantic
 * matching degrades silently to "exact-only" if Gemini becomes unavailable
 * mid-loop — a missed fuzzy match must never fail report generation.
 */
async function tagDuplicates<T extends { confidence: number }>(
  items: T[],
  getName: (item: T) => string,
  candidates: Candidate[],
  entityLabel: string,
  budget: { remaining: number },
): Promise<(T & { duplicate: DuplicateRef | null })[]> {
  const list: KpiCandidate[] = candidates.map((c) => ({ id: c.id, name: c.name }));
  const out: (T & { duplicate: DuplicateRef | null })[] = [];

  for (const item of items) {
    const name = getName(item);
    const exact = candidates.find((c) => norm(c.name) === norm(name));
    if (exact) {
      out.push({ ...item, duplicate: { id: exact.id, name: exact.name, ownerName: exact.ownerName, confidence: null } });
      continue;
    }
    let duplicate: DuplicateRef | null = null;
    if (budget.remaining > 0 && list.length > 0) {
      budget.remaining -= 1;
      try {
        const res = await findSemanticDuplicate(name, list, entityLabel);
        if (res.matchId) {
          const c = candidates.find((x) => x.id === res.matchId);
          if (c) duplicate = { id: c.id, name: c.name, ownerName: c.ownerName, confidence: res.confidence ?? null };
        }
      } catch (err) {
        if (err instanceof GeminiUnavailableError) {
          budget.remaining = 0; // stop the semantic pass; keep exact matches
        } else {
          throw err;
        }
      }
    }
    out.push({ ...item, duplicate });
  }
  return out;
}

const ownerName = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || null : null;

/**
 * DAILY-only: overwrite the model's meeting-details guesses with real data,
 * and compute `attendance.notPresent`/`comparisonNote` from the most recent
 * prior DAILY huddle for the same client that has a saved report. Looks back
 * a few transcripts (not just the immediately-prior one) in case a day's
 * report was never generated/saved.
 */
async function applyDailyDeterministicFields(
  report: Awaited<ReturnType<typeof generateMeetingReport>>,
  orgId: string,
  t: { clientId: string | null; meetingDate: Date | null; startedAt: Date | null; durationMinutes: number | null },
): Promise<Awaited<ReturnType<typeof generateMeetingReport>>> {
  if (report.reportType !== "DAILY") return report;

  const meetingDate = t.meetingDate ? new Date(t.meetingDate) : null;
  const timeSource = t.startedAt ? new Date(t.startedAt) : meetingDate;

  const meetingDetails = {
    meetingType: report.meetingDetails?.meetingType ?? null,
    startMark: report.meetingDetails?.startMark ?? null,
    endMark: report.meetingDetails?.endMark ?? null,
    dateLabel: meetingDate ? formatMeetingDateLabel(meetingDate) : report.meetingDetails?.dateLabel ?? null,
    durationLabel: formatDurationLabel(t.durationMinutes) ?? report.meetingDetails?.durationLabel ?? null,
    timeOfDay: timeSource ? inferTimeOfDay(timeSource) : report.meetingDetails?.timeOfDay ?? null,
  };

  let notPresent: string[] = [];
  let comparisonNote: string | null = null;
  const todayNames = (report.attendance?.present ?? []).map((p) => p.name);

  if (t.clientId && meetingDate) {
    const priorCandidates = await db.clientMeetingTranscript.findMany({
      where: { orgId, clientId: t.clientId, type: "DAILY", meetingDate: { lt: meetingDate }, deletedAt: null },
      orderBy: { meetingDate: "desc" },
      take: 5,
      select: { meetingDate: true, report: true },
    });
    const prev = priorCandidates.find((p) => p.report);
    if (prev?.report) {
      const prevReport = prev.report as { attendance?: { present?: { name?: string | null }[] } };
      const prevNames = (prevReport.attendance?.present ?? [])
        .map((p) => p.name)
        .filter((n): n is string => Boolean(n));
      notPresent = diffAttendance(prevNames, todayNames);
      if (prev.meetingDate) {
        comparisonNote = `compared with the previous huddle of ${formatMeetingDateLabel(new Date(prev.meetingDate))}`;
      }
    }
  }

  return {
    ...report,
    meetingDetails,
    attendance: { present: report.attendance?.present ?? [], notPresent, comparisonNote },
  };
}

/**
 * POST /api/client-meetings/transcripts/[id]/report/generate
 *
 * Generate (do NOT persist) an AI meeting report for one transcript, with each
 * extracted KPI/Priority/WWW candidate tagged against existing QuikScale
 * records. Requires `ClientMeetings.Report` view. `canEdit` reflects whether
 * the caller also has `update` (the Edit Report gate) so the UI knows whether
 * to allow editing + Save.
 *
 * Responses (all 200):
 *   { report, canEdit }        — generated report with duplicate tags
 *   { aiUnavailable: true, aiReason, aiRetryAfterSec, aiDetail }
 *                              — every Gemini key failed; `aiReason` says which
 *                                of QUOTA / AUTH / MODEL_NOT_FOUND / NO_KEYS,
 *                                so the panel can tell the user whether to wait
 *                                or to fix configuration
 *   { reportError: string }    — model output could not be parsed
 */
export const POST = auth.view<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const t = await db.clientMeetingTranscript.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: {
      type: true,
      title: true,
      clientId: true,
      meetingDate: true,
      startedAt: true,
      durationMinutes: true,
      attendees: true,
      summary: true,
      actionItems: true,
      rawText: true,
      client: { select: { name: true } },
    },
  });
  if (!t) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  const input: ReportTranscriptInput = {
    type: t.type ?? null,
    title: t.title,
    clientName: t.client?.name ?? null,
    meetingDate: t.meetingDate ? new Date(t.meetingDate).toISOString().slice(0, 10) : null,
    durationMinutes: t.durationMinutes,
    attendees: (t.attendees as ReportTranscriptInput["attendees"]) ?? [],
    summary: t.summary,
    actionItems: (t.actionItems as ReportTranscriptInput["actionItems"]) ?? [],
    rawText: t.rawText,
  };

  let report;
  try {
    report = await generateMeetingReport(input);
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      // Pass the classified reason through. "Unavailable" alone sent people
      // hunting for a bug in the report code when the answer was a quota
      // window that refills in seconds, or a model id that no longer exists.
      console.error(`[report/generate] AI unavailable (${err.reason}): ${err.message}`);
      return NextResponse.json({
        success: true,
        data: {
          aiUnavailable: true,
          aiReason: err.reason,
          aiRetryAfterSec: err.retryAfterSec,
          aiDetail: err.message,
        },
      });
    }
    if (err instanceof MeetingReportError) {
      return NextResponse.json({ success: true, data: { reportError: err.message } });
    }
    throw err; // unexpected → 500 via withOrgAuth
  }

  report = await applyDailyDeterministicFields(report, orgId, {
    clientId: t.clientId,
    meetingDate: t.meetingDate,
    startedAt: t.startedAt,
    durationMinutes: t.durationMinutes,
  });

  // Load candidate sets once for duplicate tagging (org-wide, active).
  const [kpis, priorities, wwws] = await Promise.all([
    db.kPI.findMany({
      where: { orgId, deletedAt: null, kpiLevel: "individual", parentKPIId: null },
      select: { id: true, name: true, owner_user: { select: { firstName: true, lastName: true } } },
      take: CANDIDATE_CAP,
    }),
    db.priority.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, name: true, owner_user: { select: { firstName: true, lastName: true } } },
      take: CANDIDATE_CAP,
    }),
    db.wWWItem.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, what: true, who: true },
      take: CANDIDATE_CAP,
    }),
  ]);

  const kpiCands: Candidate[] = kpis.map((k) => ({ id: k.id, name: k.name, ownerName: ownerName(k.owner_user) }));
  const prioCands: Candidate[] = priorities.map((p) => ({ id: p.id, name: p.name, ownerName: ownerName(p.owner_user) }));
  const wwwCands: Candidate[] = wwws.map((w) => ({ id: w.id, name: w.what, ownerName: w.who ?? null }));

  const budget = { remaining: SEMANTIC_BUDGET };
  const [taggedKpis, taggedPriorities, taggedWwws] = [
    await tagDuplicates(report.extractedItems.kpis, (k) => k.name, kpiCands, "KPI", budget),
    await tagDuplicates(report.extractedItems.priorities, (p) => p.name, prioCands, "Priority", budget),
    await tagDuplicates(report.extractedItems.wwws, (w) => w.what, wwwCands, "WWW", budget),
  ];

  const stored: StoredMeetingReport = {
    ...report,
    extractedItems: { kpis: taggedKpis, priorities: taggedPriorities, wwws: taggedWwws },
  };

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  return NextResponse.json({ success: true, data: { report: stored, canEdit } });
});
