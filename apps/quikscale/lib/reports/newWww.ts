/**
 * New WWW — commitments made in THIS meeting, not yet in the business record.
 *
 * A deliberately separate section from WWW Review. Review looks backwards at
 * items that already exist; this looks at what was just agreed and is not
 * recorded anywhere yet. Merging them would blur the one question the
 * facilitator needs answered — "did we capture what we just committed to?"
 *
 * NOTHING IS EVER CREATED AUTOMATICALLY
 * -------------------------------------
 * These are candidates. A human presses Create, and only then does a `WWWItem`
 * exist. Auto-creation would fill the WWW list with items nobody agreed to own
 * and destroy trust in the module within a week — and a wrong item is far
 * harder to remove than a missing one is to add.
 *
 * MISSING FIELDS ARE FLAGGED, NEVER INVENTED
 * ------------------------------------------
 * The requirement doc's worked example: *"Rahul will complete API integration"*
 * with no date stated must report **When: Not specified**. Not Friday, not end
 * of week, not anything. The extractor asserts `whenMissing` positively rather
 * than omitting a field, and this module surfaces it as a gap for a human to
 * fill.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §I.4, §J.
 */

import { db } from "@/lib/db";

import {
  resolveWhoBatch,
  whoKey,
  type WhoResolution,
} from "@/lib/services/wwwWhoBridge";

import { LINK_ORIGIN } from "@/lib/reports/wwwCandidateMatch";

export interface NewWwwCandidate {
  factId: string;
  /** Speaker label exactly as the transcript had it. */
  whoRaw: string | null;
  /** Resolution to a tenant user. May require confirmation, or fail. */
  who: WhoResolution | null;
  what: string;
  /** The date AS SPOKEN — "this week", "month-end". Never converted. */
  whenText: string | null;
  /** True when no date was stated. Renders as "Not specified". */
  whenMissing: boolean;
  completeness: string;
  evidence: { quote: string; transcriptSegmentIds: number[] }[];
  confidence: number;
  /**
   * What a human still has to supply before this can be created. Empty means
   * Create can be pressed as-is.
   */
  missingFields: ("who" | "what" | "when")[];
  /** Already created from this candidate. */
  linkedWwwItemId: string | null;
  dismissedAt: Date | null;
}

export interface NewWwwResult {
  candidates: NewWwwCandidate[];
  summary: {
    total: number;
    ready: number;
    needsInput: number;
    created: number;
    dismissed: number;
    missingWhen: number;
    unresolvedOwner: number;
  };
}

/**
 * Build the New WWW section for one meeting.
 *
 * Dismissed candidates are returned rather than filtered out, so the UI can
 * show them collapsed. A dismissal that vanished from the response would look
 * like a bug to the facilitator who dismissed it, and would invite them to
 * dismiss the same suggestion again after every regenerate.
 */
export async function buildNewWww(
  orgId: string,
  transcriptId: string,
  clientId: string | null,
  options: { includeDismissed?: boolean } = {},
): Promise<NewWwwResult> {
  const facts = await db.meetingWwwFact.findMany({
    where: {
      orgId,
      transcriptId,
      deletedAt: null,
      mergedIntoId: null,
      // Items already matched to an existing WWW belong to the Review section.
      linkedWwwItemId: null,
      ...(options.includeDismissed ? {} : { dismissedAt: null }),
    },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      whoRaw: true,
      whoMemberId: true,
      what: true,
      whenText: true,
      whenMissing: true,
      completeness: true,
      evidence: true,
      confidence: true,
      linkedWwwItemId: true,
      dismissedAt: true,
    },
  });

  if (facts.length === 0) {
    return { candidates: [], summary: emptySummary() };
  }

  // Resolved in one batch: a page of candidates usually shares a few owners,
  // and resolving per row would be N round trips on every report view.
  const resolutions = await resolveWhoBatch(
    orgId,
    clientId,
    facts
      .filter((f) => f.whoRaw)
      .map((f) => ({ speakerRaw: f.whoRaw as string, clientMemberId: f.whoMemberId })),
  );

  const candidates: NewWwwCandidate[] = facts.map((f) => {
    const who = f.whoRaw
      ? (resolutions.get(whoKey(f.whoRaw, f.whoMemberId)) ?? null)
      : null;

    const missingFields: NewWwwCandidate["missingFields"] = [];
    // An owner that only "needs confirmation" still counts as missing input —
    // the point is that a human must look at it before anything is created.
    if (!who || who.confidence !== "RESOLVED") missingFields.push("who");
    if (!f.what?.trim()) missingFields.push("what");
    if (f.whenMissing) missingFields.push("when");

    return {
      factId: f.id,
      whoRaw: f.whoRaw,
      who,
      what: f.what,
      whenText: f.whenText,
      whenMissing: f.whenMissing,
      completeness: f.completeness,
      evidence: Array.isArray(f.evidence)
        ? (f.evidence as { quote: string; transcriptSegmentIds: number[] }[])
        : [],
      confidence: f.confidence,
      missingFields,
      linkedWwwItemId: f.linkedWwwItemId,
      dismissedAt: f.dismissedAt,
    };
  });

  return { candidates, summary: summarise(candidates) };
}

function emptySummary(): NewWwwResult["summary"] {
  return {
    total: 0,
    ready: 0,
    needsInput: 0,
    created: 0,
    dismissed: 0,
    missingWhen: 0,
    unresolvedOwner: 0,
  };
}

function summarise(candidates: NewWwwCandidate[]): NewWwwResult["summary"] {
  const live = candidates.filter((c) => !c.dismissedAt && !c.linkedWwwItemId);
  return {
    total: candidates.length,
    ready: live.filter((c) => c.missingFields.length === 0).length,
    needsInput: live.filter((c) => c.missingFields.length > 0).length,
    created: candidates.filter((c) => c.linkedWwwItemId).length,
    dismissed: candidates.filter((c) => c.dismissedAt).length,
    missingWhen: live.filter((c) => c.whenMissing).length,
    unresolvedOwner: live.filter((c) => c.who?.confidence !== "RESOLVED").length,
  };
}

/**
 * Record that a candidate became a real WWW item.
 *
 * Called AFTER `POST /api/www` has created the row, never instead of it — the
 * creation itself goes through the existing route so its Zod schema, 409
 * duplicate guard, `www.created` QuikFlow event, audit trail and notifications
 * all apply unchanged. A parallel write path would silently skip every one of
 * those.
 */
export async function linkCandidate(
  orgId: string,
  factId: string,
  wwwItemId: string,
): Promise<void> {
  await db.meetingWwwFact.updateMany({
    where: { id: factId, orgId },
    data: {
      linkedWwwItemId: wwwItemId,
      // Stamped so WWW Review can tell "this meeting produced the item" apart
      // from "this meeting discussed an item that already existed". Without it
      // an item created from Monday's huddle would show up as a review of
      // itself in the same week's report.
      linkOrigin: LINK_ORIGIN.CREATED,
    },
  });
}

/**
 * Dismiss a candidate.
 *
 * The dismissal PERSISTS, which is the whole point: a rejected suggestion must
 * not reappear after the next regenerate, or the facilitator re-rejects the
 * same thing every week and stops trusting the section.
 */
export async function dismissCandidate(
  orgId: string,
  factId: string,
  userId: string,
  reason?: string | null,
): Promise<boolean> {
  const result = await db.meetingWwwFact.updateMany({
    where: { id: factId, orgId, dismissedAt: null },
    data: { dismissedAt: new Date(), dismissedBy: userId, dismissReason: reason ?? null },
  });
  return result.count > 0;
}
