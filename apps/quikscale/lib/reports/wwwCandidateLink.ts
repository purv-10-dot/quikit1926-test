/**
 * Persisting the WWW candidate matcher's decisions.
 *
 * Split from `wwwCandidateMatch.ts` so the matching RULES stay pure and
 * mock-free: every threshold, gate and tie-break is unit-tested against plain
 * objects, exactly as the repo's testing standard asks of pure logic. This file
 * is the thin database half — it gathers inputs, calls the pure matcher, and
 * writes the links.
 */

import { db } from "@/lib/db";
import { resolveWhoBatch, whoKey } from "@/lib/services/wwwWhoBridge";
import {
  LINK_ORIGIN,
  matchCandidates,
  type MatchableCandidate,
  type MatchOutcome,
} from "@/lib/reports/wwwCandidateMatch";

/**
 * Run the matcher for one meeting and persist the links.
 *
 * Idempotent: only facts with no link at all are considered, so re-running
 * after a regenerate neither duplicates work nor re-decides a link a human may
 * since have acted on. Returns the number of new links written.
 *
 * Deliberately writes ONLY `linkedWwwItemId`, `linkOrigin`, `matchRule` and
 * `matchConfidence`. It never touches `WWWItem` — matching is an observation
 * about a meeting, not a change to business state.
 */
export async function linkExistingMatches(
  orgId: string,
  transcriptId: string,
  clientId: string | null,
  meetingStart: Date,
): Promise<{ linked: number; outcome: MatchOutcome }> {
  const facts = await db.meetingWwwFact.findMany({
    where: {
      orgId,
      transcriptId,
      deletedAt: null,
      mergedIntoId: null,
      linkedWwwItemId: null,
      dismissedAt: null,
    },
    select: {
      id: true,
      normalizedKey: true,
      what: true,
      whoRaw: true,
      whoUserId: true,
      whoMemberId: true,
    },
  });

  if (facts.length === 0) {
    return { linked: 0, outcome: { matches: [], unmatched: [] } };
  }

  // Owner resolution goes through the who-bridge — the same ladder the New WWW
  // section uses, so a candidate cannot resolve to one person in one section
  // and someone else in the other. `ClientMember` has no foreign key to `User`;
  // the join runs through email, and re-implementing it here would duplicate a
  // subtlety that is already tested.
  //
  // ONLY `RESOLVED` counts. Rungs 3 and 4 return NEEDS_CONFIRMATION precisely
  // because a name alone can name the wrong colleague, and this matcher writes
  // meeting history with nobody watching. A guess that needs a human is not a
  // basis for one.
  const resolutions = await resolveWhoBatch(
    orgId,
    clientId,
    facts
      .filter((f) => f.whoRaw)
      .map((f) => ({ speakerRaw: f.whoRaw as string, clientMemberId: f.whoMemberId })),
  );

  const candidates: MatchableCandidate[] = facts.map((f) => {
    const owners = new Set<string>();
    if (f.whoUserId) owners.add(f.whoUserId);

    const resolved = f.whoRaw ? resolutions.get(whoKey(f.whoRaw, f.whoMemberId)) : null;
    if (resolved?.confidence === "RESOLVED" && resolved.userId) {
      owners.add(resolved.userId);
    }

    return {
      factId: f.id,
      normalizedKey: f.normalizedKey,
      what: f.what,
      ownerUserIds: [...owners],
    };
  });

  const owningUserIds = [...new Set(candidates.flatMap((c) => c.ownerUserIds))];
  if (owningUserIds.length === 0) {
    return {
      linked: 0,
      outcome: {
        matches: [],
        unmatched: candidates.map((c) => ({
          factId: c.factId,
          reason: "NO_RESOLVED_OWNER" as const,
        })),
      },
    };
  }

  // Candidate items are scoped by OWNER, not by client: `WWWItem` carries no
  // client column, and the owners were themselves derived from this meeting's
  // roster. Row-level visibility is NOT applied here — matching is a background
  // observation, and the viewer's permissions are enforced where the section is
  // read, so a match must not silently depend on who happened to press
  // Generate.
  const items = await db.wWWItem.findMany({
    where: {
      orgId,
      deletedAt: null,
      createdAt: { lt: meetingStart },
      OR: [{ who: { in: owningUserIds } }, { whoIds: { hasSome: owningUserIds } }],
    },
    select: { id: true, what: true, who: true, whoIds: true, createdAt: true },
  });

  const outcome = matchCandidates(
    candidates,
    items.map((i) => ({
      id: i.id,
      what: i.what,
      ownerUserIds: [...new Set([i.who, ...i.whoIds])].filter(Boolean),
      createdAt: i.createdAt,
    })),
    meetingStart,
  );

  for (const match of outcome.matches) {
    // Guarded on `linkedWwwItemId: null` so a concurrent Create cannot be
    // overwritten by a match decided from stale data.
    await db.meetingWwwFact.updateMany({
      where: { id: match.factId, orgId, linkedWwwItemId: null },
      data: {
        linkedWwwItemId: match.wwwItemId,
        linkOrigin: LINK_ORIGIN.MATCHED_EXISTING,
        matchRule: match.rule,
        matchConfidence: match.confidence,
      },
    });
  }

  return { linked: outcome.matches.length, outcome };
}
