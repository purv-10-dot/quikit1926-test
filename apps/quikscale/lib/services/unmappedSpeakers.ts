/**
 * The unmapped-speaker tray: names a recording used that the roster could not
 * resolve, with the matcher's own suggestion attached.
 *
 * WHY THIS EXISTS
 * ---------------
 * `participantMatch.ts` rung 6 is deliberately advisory: a fuzzy hit comes back
 * as `pendingConfirm`, and `resolvedMemberId()` refuses to act on it, because
 * silently merging two similar names is how one person's blocker gets
 * attributed to another. That is the right call — but it only works if a human
 * can actually answer the question being asked.
 *
 * Before this module nobody could. `DayAttendance.unresolved` (which already
 * carried `suggestedMemberId`) was computed per day and consumed by nothing, and
 * `ClientMemberAlias` — the table that records the answer — was read in two
 * places and written by none. A transcript that spelled "Ashwin Signone" as
 * "Ashwin Singone" therefore matched at jaro 0.976, was withheld pending
 * confirmation, and stayed unmapped forever with no way to confirm it.
 *
 * This turns that dead-ended data into one reviewable list per week: who was
 * heard, how often, who they probably are, and how confident that guess is.
 * Saving the answer is `POST /api/client-meetings/members/aliases`.
 *
 * Pure and roster-shaped on purpose — no Prisma — so the aggregation is unit
 * testable without a database.
 */

import {
  jaro,
  nameKeysFor,
  normalizeName,
  type MatchableMember,
} from "@/lib/ai/participantMatch";
import type { HuddleDay, UnresolvedParticipant } from "@/lib/ai/weeklyHuddleAggregate";

/** The matcher's proposal for one unmapped name. Never applied automatically. */
export interface UnmappedSuggestion {
  memberId: string;
  memberName: string;
  /**
   * Jaro similarity, 0..1, recomputed against the suggested member's name keys
   * with the same function the matcher used. Shown as a percentage so a human
   * can tell "almost certainly a typo" (0.97) from "worth a look" (0.92).
   */
  confidence: number;
}

/** One row of the tray: a name heard in the week that resolved to nobody. */
export interface UnmappedSpeaker {
  /** As the recording spelled it — the string an alias would be recorded for. */
  name: string;
  email: string | null;
  reason: UnresolvedParticipant["reason"];
  /** How many days of the week this name was heard. Ranks the real gaps first. */
  daysHeard: number;
  /** Present when the matcher had a single high-confidence candidate. */
  suggestion: UnmappedSuggestion | null;
  /** Roster names that tied, when `reason` is `ambiguous`. */
  candidates: string[];
}

/**
 * Score a name against a member the way rung 6 did.
 *
 * Recomputed rather than plumbed through the report: the matcher returns the
 * winning member but not its score, and re-running the same `jaro` over the same
 * keys reproduces it exactly — a cheap string comparison per candidate.
 */
function confidenceFor(name: string, member: MatchableMember): number {
  const key = normalizeName(name);
  const scores = nameKeysFor(member.name).map((k) => jaro(key, k));
  return scores.length ? Math.max(...scores) : 0;
}

/**
 * Collapse every day's unresolved names into one list for the week.
 *
 * Deduped on the normalised name, so "Ashwin Singone" heard on four days is one
 * row to answer rather than four. `daysHeard` keeps the frequency, because a
 * name heard every day is a roster gap worth fixing and a name heard once is
 * often a guest.
 *
 * Sorted by suggestion-first, then by days heard, then alphabetically: the rows
 * a human can dispatch with one click come first, and the ordering is stable
 * across requests (no timestamps, no map-iteration surprises).
 */
export function collectUnmappedSpeakers(
  days: HuddleDay[],
  roster: MatchableMember[],
): UnmappedSpeaker[] {
  const byId = new Map(roster.map((m) => [m.id, m]));
  const merged = new Map<string, UnmappedSpeaker>();

  for (const day of days) {
    for (const u of day.attendance.unresolved) {
      const key = normalizeName(u.name);
      if (!key) continue;

      const existing = merged.get(key);
      if (existing) {
        existing.daysHeard += 1;
        // An email seen on any day is better than none: it is the only
        // unambiguous identifier, and the alias UI shows it to disambiguate
        // two people with similar names.
        existing.email ??= u.email;
        continue;
      }

      const suggested = u.suggestedMemberId ? byId.get(u.suggestedMemberId) : undefined;
      merged.set(key, {
        name: u.name,
        email: u.email,
        reason: u.reason,
        daysHeard: 1,
        suggestion: suggested
          ? {
              memberId: suggested.id,
              memberName: suggested.name,
              confidence: Number(confidenceFor(u.name, suggested).toFixed(4)),
            }
          : null,
        candidates: u.candidates ?? [],
      });
    }
  }

  return [...merged.values()].sort(
    (a, b) =>
      Number(Boolean(b.suggestion)) - Number(Boolean(a.suggestion)) ||
      b.daysHeard - a.daysHeard ||
      a.name.localeCompare(b.name),
  );
}
