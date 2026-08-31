/**
 * Resolve a person named by a meeting recording onto the client roster.
 *
 * Every attendance and adherence number in the Daily Huddle Weekly Report is
 * only as good as this. Get it wrong and a real attendee becomes an
 * "unrecognized speaker", their adherence vanishes from the heat map, and the
 * team's attendance percentage is quietly understated.
 *
 * The ladder, strongest evidence first. **First unique hit wins; a tie never
 * resolves** — guessing between two people is what produces a report that
 * attributes one person's blocker to another.
 *
 *   1. Email        — exact, after normalising case and `+tag`. Meeting
 *                     participant lists carry email; names do not. This rung
 *                     alone resolves most of what used to fail.
 *   2. Exact name   — normalised full name.
 *   3. Alias        — a human's one-time answer ("Bobby" → "Harjinder (Bobby)
 *                     Kohli"). No algorithm can infer these.
 *   4. Parenthetical— "Harjinder (Bobby) Kohli" also indexes as "Harjinder
 *                     Kohli" and "Bobby", so the common nickname-in-brackets
 *                     convention works without anyone configuring it.
 *   5. Token subset — bidirectional and unique ("Ashwin" ↔ "Ashwin Singone").
 *                     The first token must line up either way, so "Kumar"
 *                     alone can never claim "Amit Kumar".
 *   6. Fuzzy        — high-confidence typo tolerance, returned as
 *                     `pendingConfirm`. **Never auto-accepted**: it proposes,
 *                     a human disposes.
 *
 * Anything else is `unknown` — reported honestly rather than absorbed.
 */

/** A roster member this matcher can resolve onto. */
export interface MatchableMember {
  id: string;
  name: string;
  email?: string | null;
  isExternal?: boolean;
}

export interface MemberAlias {
  clientMemberId: string;
  normalizedAlias: string;
}

export type MatchReason =
  | "email"
  | "exact"
  | "alias"
  | "parenthetical"
  | "partial"
  | "fuzzy"
  | "ambiguous"
  | "external"
  | "unknown";

export interface MatchResult {
  memberId: string | null;
  /** Roster spelling when resolved; the trimmed input otherwise. */
  canonicalName: string;
  reason: MatchReason;
  /** True for a fuzzy hit: usable as a suggestion, never as a fact. */
  pendingConfirm: boolean;
  /** Roster names that tied, for `ambiguous`. */
  candidates?: string[];
}

/** Lowercase, strip punctuation and collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,_*"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise an email for comparison: lowercase, trimmed, `+tag` removed.
 *
 * The plus-tag strip matters because calendar invites and recording platforms
 * frequently carry a tagged address for the same human.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  const [local, domain] = trimmed.split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/**
 * Every name a member should be findable by.
 *
 * "Harjinder (Bobby) Kohli" yields the full string, "Harjinder Kohli" (brackets
 * removed) and "Bobby" (the bracketed part alone) — so the nickname convention
 * works with no configuration, which is the single most common reason a real
 * attendee fails to match.
 */
export function nameKeysFor(name: string): string[] {
  const keys = new Set<string>();
  const full = normalizeName(name);
  if (full) keys.add(full);

  const bracket = /\(([^)]+)\)/.exec(name);
  if (bracket) {
    const inner = normalizeName(bracket[1]);
    if (inner) keys.add(inner);
    const without = normalizeName(name.replace(/\([^)]*\)/g, " "));
    if (without) keys.add(without);
  }

  return [...keys];
}

/**
 * Party names that are organisations or teams, not people.
 *
 * A blocker raised for "Hexaware AWS Team" or "Client (Shivam project)" is
 * perfectly legitimate and must not be reported as an unmatched person — that
 * noise is what buries the genuine roster gaps.
 */
const ORG_WORDS =
  /\b(team|teams|client|clients|group|dept|department|vendor|partner|support|desk|helpdesk|engineering|hiring|finance|hr|ops|operations|admin|it|qa|inc|ltd|llc|pvt|corp|company)\b/i;

export function looksLikeOrganisation(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.includes("/") || trimmed.includes("&")) return true;
  if (ORG_WORDS.test(trimmed)) return true;
  // A bare single token that is not a plausible given name (has digits, or is
  // very long) is more likely a system or team label than a person.
  return /\d/.test(trimmed);
}

/**
 * Jaro similarity, 0..1.
 *
 * The matcher scores on plain Jaro, deliberately NOT Jaro-Winkler. Winkler's
 * prefix bonus rewards a shared opening, and colleagues sharing a first name
 * are extremely common — "Ajay Baheti" vs "Ajay Bhatt" scores 0.921 under
 * Winkler (above any useful threshold) but 0.87 under Jaro. Using Winkler here
 * would propose merging two real, different people.
 */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bFlags[j] || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/**
 * Jaro-Winkler — Jaro plus a bonus for a shared prefix.
 *
 * Exported for callers that genuinely want prefix weighting. The participant
 * matcher does NOT use it; see the note on `jaro`.
 */
export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  if (base === 0 || base === 1) return base;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return base + prefix * 0.1 * (1 - base);
}

/** Above this, a fuzzy hit is worth proposing to a human. Never auto-accepted. */
export const FUZZY_THRESHOLD = 0.92;

/** Pre-built lookup tables. Build once per report, not once per name. */
export interface RosterIndex {
  members: MatchableMember[];
  byEmail: Map<string, MatchableMember>;
  byName: Map<string, MatchableMember[]>;
  byAlias: Map<string, MatchableMember>;
}

export function buildRosterIndex(
  members: MatchableMember[],
  aliases: MemberAlias[] = [],
): RosterIndex {
  const byEmail = new Map<string, MatchableMember>();
  const byName = new Map<string, MatchableMember[]>();
  const byId = new Map(members.map((m) => [m.id, m]));

  for (const m of members) {
    const email = normalizeEmail(m.email);
    // First writer wins: two members sharing an address is a data error, and
    // silently letting the later one win would make matching order-dependent.
    if (email && !byEmail.has(email)) byEmail.set(email, m);

    for (const key of nameKeysFor(m.name)) {
      const bucket = byName.get(key);
      if (bucket) bucket.push(m);
      else byName.set(key, [m]);
    }
  }

  const byAlias = new Map<string, MatchableMember>();
  for (const a of aliases) {
    const m = byId.get(a.clientMemberId);
    if (m && a.normalizedAlias) byAlias.set(a.normalizedAlias, m);
  }

  return { members, byEmail, byName, byAlias };
}

const miss = (raw: string, reason: MatchReason, candidates?: string[]): MatchResult => ({
  memberId: null,
  canonicalName: raw.trim(),
  reason,
  pendingConfirm: false,
  candidates,
});

const hit = (m: MatchableMember, reason: MatchReason, pendingConfirm = false): MatchResult => ({
  memberId: m.id,
  canonicalName: m.name,
  reason,
  pendingConfirm,
});

/**
 * Resolve one name (and optionally its email) against the roster.
 *
 * Pass `email` whenever it is available — a meeting participant list has it and
 * a transcript speaker label does not, which is exactly why participant lists
 * are the stronger attendance signal.
 */
export function matchParticipant(
  raw: string,
  index: RosterIndex,
  email?: string | null,
): MatchResult {
  const trimmed = (raw ?? "").trim();

  // 1. Email — unambiguous by construction.
  const normEmail = normalizeEmail(email);
  if (normEmail) {
    const byEmail = index.byEmail.get(normEmail);
    if (byEmail) return hit(byEmail, "email");
  }

  if (!trimmed) return miss(trimmed, "unknown");
  const key = normalizeName(trimmed);
  if (!key) return miss(trimmed, "unknown");

  // 2/4. Exact and parenthetical share one index; distinguish for reporting.
  const named = index.byName.get(key);
  if (named?.length === 1) {
    const m = named[0];
    return hit(m, normalizeName(m.name) === key ? "exact" : "parenthetical");
  }
  if (named && named.length > 1) {
    return miss(trimmed, "ambiguous", named.map((m) => m.name));
  }

  // 3. Alias — the human's recorded answer.
  const alias = index.byAlias.get(key);
  if (alias) return hit(alias, "alias");

  // 5. Bidirectional token subset, unique.
  const speakerTokens = key.split(" ");
  const partial = index.members.filter((m) =>
    nameKeysFor(m.name).some((memberKey) => {
      const memberTokens = memberKey.split(" ");
      if (speakerTokens[0] !== memberTokens[0]) return false;
      return (
        speakerTokens.every((t) => memberTokens.includes(t)) ||
        memberTokens.every((t) => speakerTokens.includes(t))
      );
    }),
  );
  if (partial.length === 1) return hit(partial[0], "partial");
  if (partial.length > 1) return miss(trimmed, "ambiguous", partial.map((m) => m.name));

  // An org/team label is a legitimate party, not a missing person.
  if (looksLikeOrganisation(trimmed)) return miss(trimmed, "external");

  // 6. Fuzzy — proposed only, and only when a single candidate stands out.
  const scored = index.members
    .map((m) => ({
      m,
      score: Math.max(...nameKeysFor(m.name).map((k) => jaro(key, k))),
    }))
    .filter((s) => s.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score + 0.02)) {
    return hit(scored[0].m, "fuzzy", true);
  }
  if (scored.length > 1) return miss(trimmed, "ambiguous", scored.map((s) => s.m.name));

  return miss(trimmed, "unknown");
}

/** Resolve only when the match is safe to act on without a human. */
export function resolvedMemberId(result: MatchResult): string | null {
  return result.pendingConfirm ? null : result.memberId;
}
