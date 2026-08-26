/**
 * Matching an extracted WWW candidate to a WWW item that ALREADY EXISTS.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * The extractor cannot know whether a commitment it hears is new. It emits
 * every one as a candidate. So a meeting that spends five minutes reviewing
 * "Improve client follow-up" — an item created three weeks ago — produced a
 * candidate that looked brand new, and `MeetingWwwFact.linkedWwwItemId` stayed
 * null because the only writer was `linkCandidate()`, which runs after a human
 * creates something.
 *
 * The consequence was that WWW Review had nothing to select on, and fell back
 * to listing every open WWW the viewer could see. That is a status list, not a
 * meeting report: it answers "what is outstanding for this client?" when the
 * question is "what did this meeting say about what we already committed to?".
 *
 * This module answers the second question. Its output is the WWW Review
 * section's selector.
 *
 * THE ASYMMETRY THAT SETS EVERY THRESHOLD
 * ---------------------------------------
 * A missed match shows a discussed item under New WWW. The user sees it, and
 * either ignores it or creates a duplicate they can delete.
 *
 * A WRONG match writes a false claim into meeting history: it says this meeting
 * discussed a commitment it never mentioned, and attributes a status change to
 * a conversation that did not happen. That is not a duplicate anybody can spot
 * — it is a plausible-looking lie in a report a facilitator acts on.
 *
 * So: **never match on doubt.** A tie never resolves, the ambiguous band is
 * left unmatched, and every match records the rule and score that produced it
 * so it can be explained and reversed.
 *
 * WHY THE SAME THRESHOLDS AS `consolidate.ts`
 * -------------------------------------------
 * The comparison is the same one: "are these two sentences describing the same
 * commitment?". Reusing `normalizeKey`, `jaccard`, `jaro` and `THRESHOLDS`
 * means a phrase pair that merges within a meeting also matches across
 * meetings. Two independently tuned similarity systems would eventually
 * disagree with each other, and neither would be wrong in isolation.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §I.3.
 */

import { jaro } from "@/lib/ai/participantMatch";
import { jaccard, normalizeKey, THRESHOLDS } from "@/lib/facts/consolidate";

/**
 * Why a fact points at a `WWWItem`.
 *
 * A null column on an existing row reads as `CREATED`: `linkCandidate()` was
 * the only writer before this feature, so that is what every legacy link is.
 */
export const LINK_ORIGIN = {
  /** This meeting produced the item — a human pressed Create. */
  CREATED: "CREATED",
  /** This meeting DISCUSSED an item that already existed. */
  MATCHED_EXISTING: "MATCHED_EXISTING",
} as const;
export type LinkOrigin = (typeof LINK_ORIGIN)[keyof typeof LINK_ORIGIN];

/** Which comparison produced a match. Mirrors `consolidate.ts`'s vocabulary. */
export const MATCH_RULES = {
  EXACT_KEY: "EXACT_KEY",
  TOKEN_SIMILARITY: "TOKEN_SIMILARITY",
  JARO: "JARO",
} as const;
export type MatchRule = (typeof MATCH_RULES)[keyof typeof MATCH_RULES];

/** The minimum a candidate must expose to be matched. */
export interface MatchableCandidate {
  factId: string;
  /** Canonical key of `what`, already stored on the fact row. */
  normalizedKey: string;
  what: string;
  /**
   * Tenant user ids this candidate could belong to. Usually one; empty when the
   * owner never resolved, which blocks matching entirely — see `ownerOverlap`.
   */
  ownerUserIds: string[];
}

/** The minimum an existing item must expose to be matched against. */
export interface MatchableItem {
  id: string;
  what: string;
  /** `who` plus `whoIds`, de-duplicated by the caller. */
  ownerUserIds: string[];
  createdAt: Date;
}

export interface CandidateMatch {
  factId: string;
  wwwItemId: string;
  rule: MatchRule;
  /** 1 for an exact key; otherwise the similarity that cleared the threshold. */
  confidence: number;
}

export interface MatchOutcome {
  matches: CandidateMatch[];
  /** Facts left for the New WWW section, with the reason they were not matched. */
  unmatched: { factId: string; reason: UnmatchedReason }[];
}

export type UnmatchedReason =
  /** The candidate's owner never resolved to a tenant user. */
  | "NO_RESOLVED_OWNER"
  /** No item owned by this person existed before the meeting. */
  | "NO_CANDIDATE_ITEMS"
  /** Nothing cleared the merge thresholds. */
  | "NO_SIMILAR_ITEM"
  /** Two or more items scored equally well. A tie never resolves. */
  | "AMBIGUOUS";

/** Owner gate. Empty on either side is NOT a match — see `matchCandidates`. */
function ownerOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/**
 * Score one candidate against one item. Null means "not a match".
 *
 * Cheapest comparison first, exactly as `consolidate.ts` orders its stages.
 */
function score(
  candidate: MatchableCandidate,
  item: MatchableItem,
): { rule: MatchRule; confidence: number } | null {
  const itemKey = normalizeKey(item.what);
  if (!itemKey || !candidate.normalizedKey) return null;

  if (itemKey === candidate.normalizedKey) {
    return { rule: MATCH_RULES.EXACT_KEY, confidence: 1 };
  }

  const jac = jaccard(candidate.normalizedKey, itemKey);
  if (jac >= THRESHOLDS.jaccardMerge) {
    return { rule: MATCH_RULES.TOKEN_SIMILARITY, confidence: jac };
  }

  const jaroScore = jaro(candidate.normalizedKey, itemKey);
  if (jaroScore >= THRESHOLDS.jaroMerge) {
    return { rule: MATCH_RULES.JARO, confidence: jaroScore };
  }

  // The ambiguous band (>= candidateFloor) is deliberately NOT matched here.
  // `consolidate.ts` hands that band to an adjudicator because a missed merge
  // inflates a recurrence count. Here a wrong match falsifies meeting history,
  // so the band is simply left for the human to see under New WWW.
  return null;
}

/**
 * Decide which candidates are reviews of existing commitments.
 *
 * Pure: no database access, no writes. Every rule is visible in one place and
 * every decision is unit-testable without a fixture database.
 *
 * TWO GATES BEFORE ANY TEXT IS COMPARED
 * -------------------------------------
 * 1. **Owner overlap.** "Send the pricing deck" owned by Rohit and the same
 *    sentence owned by Gourav are two commitments, and merging them assigns one
 *    person's work to another. An unresolved owner blocks matching outright
 *    rather than matching loosely: the whole point of the section is that it
 *    reports on a named person's commitment.
 *
 * 2. **The item predates the meeting.** An item created FROM this meeting is
 *    New WWW, not a review of itself. Without this gate the Monday huddle that
 *    created an item would show it under Review in the same week's report.
 */
export function matchCandidates(
  candidates: MatchableCandidate[],
  items: MatchableItem[],
  meetingStart: Date,
): MatchOutcome {
  const matches: CandidateMatch[] = [];
  const unmatched: MatchOutcome["unmatched"] = [];

  // An item may only be reviewed once per meeting. Two candidates describing
  // the same commitment (the team came back to it later in the call) must not
  // produce two Review rows for one item.
  const claimed = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.ownerUserIds.length === 0) {
      unmatched.push({ factId: candidate.factId, reason: "NO_RESOLVED_OWNER" });
      continue;
    }

    const eligible = items.filter(
      (item) =>
        !claimed.has(item.id) &&
        item.createdAt < meetingStart &&
        ownerOverlap(candidate.ownerUserIds, item.ownerUserIds),
    );

    if (eligible.length === 0) {
      unmatched.push({ factId: candidate.factId, reason: "NO_CANDIDATE_ITEMS" });
      continue;
    }

    const scored = eligible
      .map((item) => ({ item, result: score(candidate, item) }))
      .filter((s): s is { item: MatchableItem; result: { rule: MatchRule; confidence: number } } =>
        s.result !== null,
      )
      .sort((a, b) => b.result.confidence - a.result.confidence);

    if (scored.length === 0) {
      unmatched.push({ factId: candidate.factId, reason: "NO_SIMILAR_ITEM" });
      continue;
    }

    // A TIE NEVER RESOLVES. Two items scoring identically means the wording
    // cannot tell them apart, and picking either one is a coin flip recorded as
    // fact. Better to show the candidate as new and let a human decide.
    if (
      scored.length > 1 &&
      Math.abs(scored[0].result.confidence - scored[1].result.confidence) < 1e-9
    ) {
      unmatched.push({ factId: candidate.factId, reason: "AMBIGUOUS" });
      continue;
    }

    const winner = scored[0];
    claimed.add(winner.item.id);
    matches.push({
      factId: candidate.factId,
      wwwItemId: winner.item.id,
      rule: winner.result.rule,
      confidence: winner.result.confidence,
    });
  }

  return { matches, unmatched };
}
