/**
 * The `who` bridge — a speaker name to a `WWWItem.who`.
 *
 * THE PROBLEM (doc 15 defect B7)
 * ------------------------------
 * `WWWItem.who` is a tenant `User` id. The extractor produces a speaker LABEL —
 * "Chirag", "Bobby", whatever the recorder wrote. Nothing connected the two, so
 * a WWW candidate could be extracted with perfect evidence and still not be
 * creatable, because there was no owner to assign it to.
 *
 * The join is real but indirect:
 *
 *     speaker label → ClientMember → ClientMembership.userId → User
 *
 * `ClientMember` is the CLIENT's roster (external people, keyed by name/email).
 * `ClientMembership` is which tenant users are attached to that client. The
 * bridge is only complete when the same human exists on both sides.
 *
 * FOUR RUNGS, AND ONLY TWO OF THEM AUTO-ASSIGN
 * --------------------------------------------
 *   1. speaker → ClientMember → ClientMembership.userId       ✅ auto
 *   2. speaker → User by exact email                          ✅ auto
 *   3. speaker → User by unique normalised name               ⚠️ needs confirmation
 *   4. nothing resolves                                        ❌ user must pick
 *
 * Rung 3 stops short deliberately. Two people can share a display name, and
 * assigning a commitment to the wrong person is worse than asking — the wrong
 * owner then gets chased for work they never agreed to, and the real owner is
 * never chased at all. A tie NEVER resolves, at any rung.
 *
 * Nothing here writes. It returns a resolution for the UI to act on, so a
 * human is always the one who commits an assignment.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §I.4.
 */

import { db } from "@/lib/db";
import { normalizeName } from "@/lib/ai/participantMatch";

/** How confidently a speaker resolved to a tenant user. */
export type WhoConfidence =
  /** Safe to assign without asking. */
  | "RESOLVED"
  /** A single plausible match, but a human must confirm it. */
  | "NEEDS_CONFIRMATION"
  /** Nothing matched, or several did. The user picks. */
  | "UNRESOLVED";

export type WhoRung =
  | "CLIENT_MEMBERSHIP"
  | "USER_EMAIL"
  | "USER_NAME"
  | "NONE";

export interface WhoResolution {
  /** The label exactly as the transcript had it. */
  speakerRaw: string;
  confidence: WhoConfidence;
  rung: WhoRung;
  /** Tenant user id for `WWWItem.who`. Null unless something matched. */
  userId: string | null;
  userName: string | null;
  /** The client-roster member, when that is what matched. */
  clientMemberId: string | null;
  /**
   * Why it did not resolve, for the UI to explain rather than silently
   * presenting an empty owner field.
   */
  reason: string | null;
  /** Populated when several candidates tied, so the picker can offer them. */
  candidates: { userId: string; name: string }[];
}

const unresolved = (
  speakerRaw: string,
  reason: string,
  candidates: { userId: string; name: string }[] = [],
): WhoResolution => ({
  speakerRaw,
  confidence: "UNRESOLVED",
  rung: "NONE",
  userId: null,
  userName: null,
  clientMemberId: null,
  reason,
  candidates,
});

const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;

/**
 * Bidirectional token subset, with the first token required to line up.
 *
 * Mirrors rung 5 of `participantMatch.ts`. "Rahul" matches "Rahul Chaure";
 * "Kumar" does NOT match "Amit Kumar", because a shared surname is not
 * identification. Getting that wrong assigns someone else's commitment to a
 * colleague who happens to share a name fragment.
 */
function tokenSubset(a: string, b: string): boolean {
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return false;
  if (at[0] !== bt[0]) return false;
  return at.every((t) => bt.includes(t)) || bt.every((t) => at.includes(t));
}

/**
 * Resolve one speaker label to a tenant user.
 *
 * `clientMemberId` may be supplied when the caller has already matched the
 * speaker to the client roster (the extraction pipeline usually has), which
 * skips straight to the membership join.
 */
export async function resolveWho(
  orgId: string,
  clientId: string | null,
  speakerRaw: string,
  options: { clientMemberId?: string | null } = {},
): Promise<WhoResolution> {
  const label = speakerRaw?.trim();
  if (!label) return unresolved(speakerRaw ?? "", "No speaker name was captured");

  // ── Rung 1: the client roster, then its tenant membership ────────────────
  let memberId = options.clientMemberId ?? null;

  if (!memberId && clientId) {
    const normalized = normalizeName(label);
    const members = await db.clientMember.findMany({
      where: { orgId, clientLinks: { some: { clientId } }, deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    const byName = members.filter((m) => normalizeName(m.name) === normalized);
    // A tie never resolves: two roster members sharing a display name means we
    // genuinely cannot tell which one spoke.
    if (byName.length === 1) memberId = byName[0].id;
  }

  if (memberId && clientId) {
    const member = await db.clientMember.findFirst({
      where: { id: memberId, orgId },
      select: { id: true, name: true, email: true },
    });

    if (member?.email) {
      // ClientMember → tenant User, via this client's membership list.
      const membership = await db.clientMembership.findFirst({
        where: {
          orgId,
          clientId,
          deletedAt: null,
          user: { email: { equals: member.email, mode: "insensitive" } },
        },
        select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
      });

      if (membership?.user) {
        return {
          speakerRaw: label,
          confidence: "RESOLVED",
          rung: "CLIENT_MEMBERSHIP",
          userId: membership.userId,
          userName: displayName(membership.user),
          clientMemberId: member.id,
          reason: null,
          candidates: [],
        };
      }
    }

    // ── Rung 2: the roster member's email against tenant users directly ────
    if (member?.email) {
      const byEmail = await db.user.findFirst({
        where: {
          email: { equals: member.email, mode: "insensitive" },
          memberships: { some: { orgId, status: "active" } },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      if (byEmail) {
        return {
          speakerRaw: label,
          confidence: "RESOLVED",
          rung: "USER_EMAIL",
          userId: byEmail.id,
          userName: displayName(byEmail),
          clientMemberId: member.id,
          reason: null,
          candidates: [],
        };
      }
    }
  }

  // ── Rung 3: a tenant user whose name matches, uniquely ───────────────────
  //
  // Deliberately NOT auto-assigned. Two colleagues can share a display name,
  // and assigning a commitment to the wrong person means the wrong person is
  // chased for work they never agreed to while the real owner is never chased.
  const orgUsers = await db.user.findMany({
    where: { memberships: { some: { orgId, status: "active" } } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const normalized = normalizeName(label);

  // Exact first, then a bidirectional token subset — because transcripts say
  // "Rahul" and tenant users are "Rahul Chaure". Exact-only matching would make
  // this rung fire almost never in practice.
  //
  // The subset rule (and its first-token guard) is lifted from
  // `participantMatch.ts` rung 5 rather than reinvented: it is already tuned so
  // that "Kumar" alone can NEVER claim "Amit Kumar", which is exactly the
  // failure mode that matters when the result is someone's commitment.
  const exact = orgUsers.filter((u) => normalizeName(displayName(u)) === normalized);
  const nameMatches = exact.length > 0 ? exact : orgUsers.filter((u) => tokenSubset(normalized, normalizeName(displayName(u))));

  if (nameMatches.length === 1) {
    const u = nameMatches[0];
    return {
      speakerRaw: label,
      confidence: "NEEDS_CONFIRMATION",
      rung: "USER_NAME",
      userId: u.id,
      userName: displayName(u),
      clientMemberId: memberId,
      reason: "Matched by name only — confirm this is the right person",
      candidates: [],
    };
  }

  if (nameMatches.length > 1) {
    return unresolved(
      label,
      `${nameMatches.length} people share this name — choose the right one`,
      nameMatches.map((u) => ({ userId: u.id, name: displayName(u) })),
    );
  }

  // ── Rung 4: nothing matched ──────────────────────────────────────────────
  return unresolved(
    label,
    memberId
      ? "On the client roster, but not linked to a QuikScale user"
      : "Not recognised — assign an owner manually",
  );
}

/**
 * Resolve several speakers at once.
 *
 * The New WWW section resolves every candidate on a page, so doing this one
 * query at a time would be N round trips per report view. Results are memoised
 * per distinct label, since the same person usually owns several items.
 */
export async function resolveWhoBatch(
  orgId: string,
  clientId: string | null,
  speakers: { speakerRaw: string; clientMemberId?: string | null }[],
): Promise<Map<string, WhoResolution>> {
  const out = new Map<string, WhoResolution>();

  for (const s of speakers) {
    const key = `${s.speakerRaw}|${s.clientMemberId ?? ""}`;
    if (out.has(key)) continue;
    out.set(key, await resolveWho(orgId, clientId, s.speakerRaw, { clientMemberId: s.clientMemberId }));
  }

  return out;
}

/** Key for looking a speaker up in a `resolveWhoBatch` result. */
export const whoKey = (speakerRaw: string, clientMemberId?: string | null): string =>
  `${speakerRaw}|${clientMemberId ?? ""}`;
