/**
 * WWW Review — what happened to the items committed in previous meetings.
 *
 * DATABASE FIRST. ALWAYS.
 * -----------------------
 * The requirement doc is emphatic: this section must call the WWW data, not
 * infer status from the current meeting's transcript. So the pull below is a
 * plain Postgres query against `WWWItem` joined to `WWWStatusHistory`, and the
 * status it reports is the STORED one.
 *
 * A transcript claim that "that's done" is rendered as an ANNOTATION beside the
 * stored status, never as a replacement for it. If a coach says an item is
 * finished and the record says `on-track`, the report shows exactly that
 * discrepancy — which is the single most useful thing a facilitator can learn
 * from this section, and is the opposite of letting the model quietly rewrite
 * business state.
 *
 * THE SECURITY EDGE
 * -----------------
 * This is the sharpest one in the whole architecture. `buildWwwScopeWhere`
 * restricts non-admins to items where `who = userId`. If this section queried
 * `WWWItem` directly it would become a way to read the entire org's action list
 * through a report — a permission bypass wearing a report's clothing. Every
 * query here goes through that helper. There is no direct-query path.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §I.3, §M.
 */

import { db } from "@/lib/db";
import { buildWwwScopeWhere } from "@/lib/api/wwwListQuery";
import {
  deriveLifecycle,
  daysToClose,
  type DerivedLifecycle,
} from "@/lib/services/wwwLifecycle";

export interface WwwReviewOptions {
  /** Items due on or after this date are in scope regardless of status. */
  periodStart?: Date;
  /** Items due on or before this. */
  periodEnd?: Date;
  /**
   * Include items already closed before the period.
   *
   * Default false: a review is about live commitments and what changed. Closed
   * items from months ago would swamp the section.
   */
  includeHistoricClosed?: boolean;
  /** Cap, so one very old client cannot produce a thousand-row section. */
  limit?: number;
}

export interface WwwReviewEvidence {
  /** Extracted from THIS meeting, referring to this item. */
  factId: string;
  quote: string;
  transcriptSegmentIds: number[];
  /** What the meeting appeared to claim about it. */
  claim: "MENTIONED" | "PROGRESS_STATED" | "CLOSURE_CLAIMED";
}

export interface WwwReviewRow {
  id: string;
  what: string;
  /** Owner today. Compare with `previousOwner` to spot a reassignment. */
  who: string;
  whoIds: string[];
  when: Date;
  dueDateTBD: boolean;
  originalDueDate: Date | null;
  revisedDates: string[];
  /** Stored status, canonicalised. Never overwritten by meeting evidence. */
  status: string;
  /** OVERDUE / CARRIED_FORWARD etc., all derived. */
  lifecycle: DerivedLifecycle;
  createdAt: Date;
  completedAt: Date | null;
  daysToClose: number | null;
  /** The status this item held when the previous meeting happened. */
  previousStatus: string | null;
  /** Most recent transition, so the report can say when it last moved. */
  lastChangedAt: Date | null;
  lastChangedBy: string | null;
  /** How many times the status has moved at all. */
  transitions: number;
  /**
   * What this meeting said about it, if anything. ANNOTATION ONLY — the
   * `status` field above remains authoritative.
   */
  meetingEvidence: WwwReviewEvidence[];
  /**
   * True when the meeting claimed closure but the record disagrees. The most
   * actionable signal in the section.
   */
  closureDisputed: boolean;
}

export interface WwwReviewResult {
  rows: WwwReviewRow[];
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    open: number;
    overdue: number;
    carriedForward: number;
    cancelled: number;
    /** Items the meeting claimed done that the record still shows open. */
    closureDisputes: number;
  };
  /** True when the caller's visibility limited what they can see. */
  scopeLimited: boolean;
}

const DEFAULT_LIMIT = 200;

/**
 * Pull previous WWW items for review.
 *
 * `asOf` is the meeting being reported on: `previousStatus` is reconstructed as
 * of that moment, so the report says what the item looked like at the time,
 * not what it looks like now.
 */
export async function buildWwwReview(
  ctx: { orgId: string; userId: string },
  clientId: string | null,
  asOf: Date,
  options: WwwReviewOptions = {},
): Promise<WwwReviewResult> {
  const { orgId, userId } = ctx;
  const limit = options.limit ?? DEFAULT_LIMIT;

  // Row-level visibility. NOT optional, and not re-implemented here — this is
  // the same helper `GET /api/www` uses, so the report can never show more than
  // the list would.
  const scopeWhere = await buildWwwScopeWhere({ orgId, userId }, {});

  // Scope: anything still open, plus anything closed inside the period. An
  // item completed during the period is exactly what a review wants to
  // celebrate; one completed last quarter is noise.
  const periodClause =
    options.periodStart || options.periodEnd
      ? {
          when: {
            ...(options.periodStart ? { gte: options.periodStart } : {}),
            ...(options.periodEnd ? { lte: options.periodEnd } : {}),
          },
        }
      : {};

  const items = await db.wWWItem.findMany({
    where: {
      ...scopeWhere,
      ...(options.includeHistoricClosed
        ? periodClause
        : {
            OR: [
              { status: { notIn: ["completed", "not-applicable"] } },
              { ...periodClause },
            ],
          }),
      createdAt: { lte: asOf },
    },
    orderBy: [{ when: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      what: true,
      who: true,
      whoIds: true,
      when: true,
      dueDateTBD: true,
      originalDueDate: true,
      revisedDates: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (items.length === 0) {
    return { rows: [], summary: emptySummary(), scopeLimited: false };
  }

  const ids = items.map((i) => i.id);

  // History for "what did this look like at the previous meeting?".
  const history = await db.wWWStatusHistory.findMany({
    where: { orgId, wwwItemId: { in: ids } },
    orderBy: { changedAt: "asc" },
    select: {
      wwwItemId: true,
      fromStatus: true,
      toStatus: true,
      changedAt: true,
      changedBy: true,
    },
  });

  const byItem = new Map<string, typeof history>();
  for (const h of history) {
    byItem.set(h.wwwItemId, [...(byItem.get(h.wwwItemId) ?? []), h]);
  }

  const rows: WwwReviewRow[] = items.map((item) => {
    const hist = byItem.get(item.id) ?? [];
    const last = hist.at(-1) ?? null;

    // The status as of the meeting being reported on. Transitions AFTER that
    // moment are excluded, so the report describes the item as it was.
    const beforeAsOf = hist.filter((h) => h.changedAt <= asOf);
    const previousStatus = beforeAsOf.at(-1)?.toStatus ?? null;

    return {
      ...item,
      status: item.status,
      lifecycle: deriveLifecycle(item),
      daysToClose: daysToClose(item),
      previousStatus,
      lastChangedAt: last?.changedAt ?? null,
      lastChangedBy: last?.changedBy ?? null,
      transitions: Math.max(0, hist.length - 1),
      meetingEvidence: [],
      closureDisputed: false,
    };
  });

  return {
    rows,
    summary: summarise(rows),
    // A non-admin sees only their own items; the section should say so rather
    // than implying the team had this few commitments.
    scopeLimited: scopeWhere.who === userId,
  };
}

/**
 * Overlay what the current meeting said about these items.
 *
 * ANNOTATION ONLY. `row.status` is untouched. When a meeting claims closure and
 * the record still shows the item open, `closureDisputed` is set — the report
 * surfaces the discrepancy rather than resolving it, because the business
 * record is the source of truth and a verbal claim is not.
 */
export async function attachMeetingEvidence(
  orgId: string,
  transcriptId: string,
  review: WwwReviewResult,
): Promise<WwwReviewResult> {
  if (review.rows.length === 0) return review;

  const facts = await db.meetingWwwFact.findMany({
    where: {
      orgId,
      transcriptId,
      deletedAt: null,
      mergedIntoId: null,
      linkedWwwItemId: { in: review.rows.map((r) => r.id) },
    },
    select: {
      id: true,
      linkedWwwItemId: true,
      what: true,
      evidence: true,
    },
  });

  const byItem = new Map<string, typeof facts>();
  for (const f of facts) {
    if (!f.linkedWwwItemId) continue;
    byItem.set(f.linkedWwwItemId, [...(byItem.get(f.linkedWwwItemId) ?? []), f]);
  }

  const rows = review.rows.map((row) => {
    const linked = byItem.get(row.id) ?? [];
    if (linked.length === 0) return row;

    const evidence: WwwReviewEvidence[] = linked.flatMap((f) => {
      const quotes = Array.isArray(f.evidence)
        ? (f.evidence as { quote: string; transcriptSegmentIds: number[] }[])
        : [];
      return quotes.map((q) => ({
        factId: f.id,
        quote: q.quote,
        transcriptSegmentIds: q.transcriptSegmentIds ?? [],
        claim: classifyClaim(q.quote),
      }));
    });

    const claimedClosed = evidence.some((e) => e.claim === "CLOSURE_CLAIMED");

    return {
      ...row,
      meetingEvidence: evidence,
      // The discrepancy the facilitator most needs to see: somebody said it was
      // done, and the record does not agree.
      closureDisputed: claimedClosed && row.lifecycle.lifecycle !== "COMPLETED",
    };
  });

  return { ...review, rows, summary: summarise(rows) };
}

/**
 * Read a claim from a quote, conservatively.
 *
 * Keyword matching, not a model call — this only decides which ANNOTATION to
 * render beside a status that is already authoritative, so a miss costs a
 * label, never a wrong status. Spending a model call on it would be paying for
 * precision that cannot change any number in the report.
 */
function classifyClaim(quote: string): WwwReviewEvidence["claim"] {
  const q = quote.toLowerCase();
  if (/\b(done|completed|closed|finished|delivered|shipped|sorted)\b/.test(q)) {
    return "CLOSURE_CLAIMED";
  }
  if (/\b(progress|started|working on|underway|in flight|halfway|nearly)\b/.test(q)) {
    return "PROGRESS_STATED";
  }
  return "MENTIONED";
}

function emptySummary(): WwwReviewResult["summary"] {
  return {
    total: 0,
    completed: 0,
    inProgress: 0,
    open: 0,
    overdue: 0,
    carriedForward: 0,
    cancelled: 0,
    closureDisputes: 0,
  };
}

function summarise(rows: WwwReviewRow[]): WwwReviewResult["summary"] {
  const is = (l: string) => rows.filter((r) => r.lifecycle.lifecycle === l).length;
  return {
    total: rows.length,
    completed: is("COMPLETED"),
    inProgress: is("IN_PROGRESS"),
    open: is("OPEN"),
    overdue: rows.filter((r) => r.lifecycle.overdue).length,
    carriedForward: rows.filter((r) => r.lifecycle.carriedForward).length,
    cancelled: is("CANCELLED"),
    closureDisputes: rows.filter((r) => r.closureDisputed).length,
  };
}
