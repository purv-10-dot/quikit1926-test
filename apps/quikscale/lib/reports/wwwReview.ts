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
  canonicalStatus,
  deriveLifecycle,
  daysToClose,
  type DerivedLifecycle,
} from "@/lib/services/wwwLifecycle";
import { STATUS_META } from "@/lib/constants/status";

export interface WwwReviewOptions {
  /**
   * THE SELECTOR. Transcripts of the meeting(s) being reported on.
   *
   * A row appears here only because a `MeetingWwwFact` extracted from one of
   * these transcripts was matched to it. That is what makes this section a
   * record of a conversation rather than a list of outstanding work.
   */
  transcriptIds: string[];
  /**
   * The moment "previous status" is taken as of — the start of the meeting, or
   * of the first meeting in the period. Transitions after it are excluded.
   */
  asOf: Date;
  /** Cap, so one very long meeting cannot produce a thousand-row section. */
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
  /**
   * Display name for `who`, resolved at build time.
   *
   * The report is a stored document that must stay readable years later and
   * render into DOCX and PDF without touching the database. A bare user id
   * would make the section unreadable — and the requirement groups rows by
   * person ("User: Rohit"), which an id cannot express.
   *
   * Null when the owner is no longer a resolvable user; the UI then falls back
   * to "Unassigned" rather than printing a cuid at a facilitator.
   */
  whoName: string | null;
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
  /**
   * The status this item held when the meeting happened.
   *
   * Kept under its original name as well as `statusAtMeeting`, because callers
   * and tests already read it and the value is identical.
   */
  previousStatus: string | null;
  /** Same value, under the name the report renders. */
  statusAtMeeting: string | null;
  /**
   * Where `statusAtMeeting` came from — the report must never present a guess
   * as a record.
   *
   *   history      a real transition on or before `asOf`
   *   unchanged    no transition at all, and the item had not been touched by
   *                `asOf`, so it still held its creation status
   *   unavailable  we genuinely do not know; renders "not recorded"
   *
   * `unavailable` exists because `WWWStatusHistory` only begins at migration
   * `20260824200000`, plus a best-effort backfill from the audit trail. Leaving
   * such a cell blank would read as "no change" — a statement about the meeting
   * that nobody made.
   */
  statusAtMeetingSource: "history" | "unchanged" | "unavailable";
  /** Stored status now, canonicalised. The live half of the comparison. */
  currentStatus: string;
  /** True only when both ends are known AND differ. */
  changed: boolean;
  /** "In Progress → Completed" · "No change" · "Previous status not recorded". */
  changeLabel: string;
  /** Dates of the meetings in this period that discussed the item. */
  discussedOn: string[];
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
  /**
   * Why the section is empty, when it is. An empty table with no explanation
   * reads as "the team discussed nothing", which is a different claim from
   * "nobody has run extraction on this meeting yet".
   */
  unavailableReason: string | null;
}

const DEFAULT_LIMIT = 200;

/**
 * Build the WWW Review section for one meeting, or one period of meetings.
 *
 * THE MEETING SELECTS, NOT THE CLIENT
 * -----------------------------------
 * This function used to ask "what is outstanding for this client?" and answer
 * with every open item the viewer could see. That is a status list. The section
 * is supposed to answer a narrower and far more useful question: **what did
 * this meeting say about commitments made before it?**
 *
 * So the selector is the meeting's own extracted facts. An item appears here
 * only because `wwwCandidateMatch` matched something actually said in the room
 * to it. No discussion, no row — however overdue the item may be.
 *
 * `asOf` fixes the "previous" end of the comparison; the stored status supplies
 * the "current" end, live.
 */
export async function buildWwwReview(
  ctx: { orgId: string; userId: string },
  options: WwwReviewOptions,
): Promise<WwwReviewResult> {
  const { orgId, userId } = ctx;
  const { transcriptIds, asOf } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (transcriptIds.length === 0) {
    return {
      ...empty(),
      unavailableReason: "No transcript was available for this period.",
    };
  }

  // ── The selector ─────────────────────────────────────────────────────────
  // Facts from THESE meetings that the matcher tied to an item which already
  // existed. `CREATED` links are deliberately excluded: an item this meeting
  // produced belongs under New WWW, not under a review of itself.
  const facts = await db.meetingWwwFact.findMany({
    where: {
      orgId,
      transcriptId: { in: transcriptIds },
      linkOrigin: "MATCHED_EXISTING",
      linkedWwwItemId: { not: null },
      deletedAt: null,
      mergedIntoId: null,
    },
    orderBy: [{ meetingDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      linkedWwwItemId: true,
      meetingDate: true,
      evidence: true,
    },
  });

  if (facts.length === 0) {
    return {
      ...empty(),
      unavailableReason:
        "No previously-created WWW item was discussed in this period. If extraction has not been run for these meetings, discussed items cannot be identified.",
    };
  }

  const discussedIds = [...new Set(facts.map((f) => f.linkedWwwItemId as string))];

  // Row-level visibility. NOT optional, and not re-implemented here — this is
  // the same helper `GET /api/www` uses, so the report can never show more than
  // the list would. Applied AFTER selection, so narrowing is a permission
  // effect and never changes which meeting is being described.
  const scopeWhere = await buildWwwScopeWhere({ orgId, userId }, {});

  const items = await db.wWWItem.findMany({
    where: { ...scopeWhere, id: { in: discussedIds } },
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
      updatedAt: true,
    },
  });

  if (items.length === 0) {
    return {
      ...empty(),
      // Items WERE discussed — the viewer simply cannot see any of them.
      scopeLimited: true,
      unavailableReason:
        "This meeting discussed WWW items, but none of them are visible to you.",
    };
  }

  const ids = items.map((i) => i.id);

  // Owner display names, resolved once. Stored on the row so the section stays
  // readable in a report opened months later, and in DOCX and PDF, without
  // reaching back into the user table.
  const ownerIds = [...new Set(items.flatMap((i) => [i.who, ...i.whoIds]).filter(Boolean))];
  const owners = ownerIds.length
    ? await db.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(
    owners.map((u) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
    ]),
  );

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

  // Evidence and discussion dates, grouped from the facts already loaded. No
  // second query: the facts ARE the selector, so what the meeting said is
  // already in hand.
  const evidenceByItem = new Map<string, WwwReviewEvidence[]>();
  const datesByItem = new Map<string, Set<string>>();
  for (const f of facts) {
    const itemId = f.linkedWwwItemId as string;

    if (f.meetingDate) {
      const set = datesByItem.get(itemId) ?? new Set<string>();
      set.add(f.meetingDate.toISOString().slice(0, 10));
      datesByItem.set(itemId, set);
    }

    const quotes = Array.isArray(f.evidence)
      ? (f.evidence as { quote: string; transcriptSegmentIds?: number[] }[])
      : [];
    const mapped = quotes.map((q) => ({
      factId: f.id,
      quote: q.quote,
      transcriptSegmentIds: q.transcriptSegmentIds ?? [],
      claim: classifyClaim(q.quote),
    }));
    evidenceByItem.set(itemId, [...(evidenceByItem.get(itemId) ?? []), ...mapped]);
  }

  const rows: WwwReviewRow[] = items.map((item) => {
    const hist = byItem.get(item.id) ?? [];
    const last = hist.at(-1) ?? null;

    // The status as of the meeting being reported on. Transitions AFTER that
    // moment are excluded, so the report describes the item as it was.
    const beforeAsOf = hist.filter((h) => h.changedAt <= asOf);
    const recorded = beforeAsOf.at(-1)?.toStatus ?? null;

    // Three-way, never a blank that reads as "no change" — see
    // `statusAtMeetingSource`.
    let statusAtMeeting: string | null;
    let statusAtMeetingSource: WwwReviewRow["statusAtMeetingSource"];
    if (recorded !== null) {
      statusAtMeeting = canonicalStatus(recorded);
      statusAtMeetingSource = "history";
    } else if (hist.length === 0 && item.updatedAt <= asOf) {
      // No transition was ever recorded AND the row has not been touched since
      // the meeting, so it still holds the status it was created with.
      statusAtMeeting = canonicalStatus(item.status);
      statusAtMeetingSource = "unchanged";
    } else {
      statusAtMeeting = null;
      statusAtMeetingSource = "unavailable";
    }

    const currentStatus = canonicalStatus(item.status);
    const changed = statusAtMeeting !== null && statusAtMeeting !== currentStatus;

    const evidence = evidenceByItem.get(item.id) ?? [];
    const claimedClosed = evidence.some((e) => e.claim === "CLOSURE_CLAIMED");
    const lifecycle = deriveLifecycle(item);

    return {
      ...item,
      status: item.status,
      whoName: nameById.get(item.who) ?? null,
      lifecycle,
      daysToClose: daysToClose(item),
      previousStatus: statusAtMeeting,
      statusAtMeeting,
      statusAtMeetingSource,
      currentStatus,
      changed,
      changeLabel: changeLabelFor(statusAtMeeting, currentStatus, statusAtMeetingSource),
      discussedOn: [...(datesByItem.get(item.id) ?? [])].sort(),
      lastChangedAt: last?.changedAt ?? null,
      lastChangedBy: last?.changedBy ?? null,
      transitions: Math.max(0, hist.length - 1),
      meetingEvidence: evidence,
      // The discrepancy the facilitator most needs to see: somebody said it was
      // done, and the record does not agree.
      closureDisputed: claimedClosed && lifecycle.lifecycle !== "COMPLETED",
    };
  });

  return {
    rows,
    summary: summarise(rows),
    unavailableReason: null,
    // A non-admin sees only their own items, and separately some discussed
    // items may have been filtered out entirely. Either way the section must
    // say so rather than implying the team committed to this little.
    scopeLimited: scopeWhere.who === userId || items.length < discussedIds.length,
  };
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

/** An empty section, before a reason is attached. */
function empty(): WwwReviewResult {
  return {
    rows: [],
    summary: emptySummary(),
    scopeLimited: false,
    unavailableReason: null,
  };
}

/**
 * The human sentence for the status comparison.
 *
 * "Previous status not recorded" is deliberately NOT "No change": we do not
 * know what the item looked like at the meeting, and claiming it was unchanged
 * would put a statement about the meeting in the report that nobody made.
 */
function changeLabelFor(
  before: string | null,
  now: string,
  source: WwwReviewRow["statusAtMeetingSource"],
): string {
  const label = (s: string) => STATUS_META[s as keyof typeof STATUS_META]?.label ?? s;
  if (source === "unavailable" || before === null) return "Previous status not recorded";
  if (before === now) return "No change";
  return `${label(before)} → ${label(now)}`;
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
