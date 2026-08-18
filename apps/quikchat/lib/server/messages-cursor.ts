/**
 * Keyset-pagination predicate for scroll-back history.
 *
 * WHY THIS IS ITS OWN MODULE, not a private helper inside messages.service.ts:
 * the only test file for that service — `lib/server/messages.service.test.ts` —
 * is in vitest.config.ts's `exclude` list (it needs a real Postgres, which CI
 * has no service for). Anything tested only there is not tested at all by
 * `npm run test`. Living here lets `messages-cursor.test.ts` cover the
 * predicate, and `messages.list.cursor.test.ts` cover the composition against
 * a mocked Prisma, both inside the suite that actually runs. Folding this back
 * into the service would silently drop both.
 *
 * ── The invariant ──────────────────────────────────────────────────────────
 * The client's canonical `["messages", channelId]` cache is held ascending by
 * `createdAt`, tiebroken by `id` (see `sortMessagesAsc` in lib/realtime-cache).
 * Paging backwards has to use the SAME total order, reversed, or the two
 * disagree at exactly the rows that share a timestamp.
 *
 * The previous cursor was `createdAt < T` alone, with `orderBy: createdAt desc`
 * and no id tiebreak. When N messages share an exact `createdAt` and the page
 * boundary (`take`) fell inside that group, the next request excluded EVERY
 * row at T — including the ones that had never been returned. They became
 * permanently unreachable, with no error: "some messages are missing from
 * history, sometimes". Strict `lt` meant duplication was impossible, so the
 * only symptom was silent loss.
 *
 * ── Planner note ───────────────────────────────────────────────────────────
 * The natural form for this is a row-value comparison, `(createdAt, id) <
 * (T, X)`, which Postgres plans as a single range scan against a composite
 * index. Prisma cannot express row-value comparison, so this emits an OR of
 * two predicates instead, which may plan as a bitmap-or across two index
 * scans. That is a Prisma limitation, NOT a deliberate choice — if you are
 * here profiling this at 10x message volume, that is the thing to change
 * (raw SQL via $queryRaw), and it is why the shape looks redundant.
 *
 * The existing `@@index([orgId, channelId, createdAt])` on QcMessage covers
 * the equality predicates and the leading sort key. Only the trailing `id` is
 * absent, so rows within a single-timestamp tie need a small sort step — tie
 * groups being tiny is the whole premise, so no migration was warranted.
 *
 * ── Comparator agreement ───────────────────────────────────────────────────
 * The tiebreak only holds if Postgres's `id < X` and the client's JS `id < X`
 * agree. QcMessage.id is `@default(uuid())`: fixed-width, lowercase hex with
 * hyphens at fixed offsets (8/13/18/23). Because the hyphens always align
 * positionally between any two ids, they can never be the first differing
 * character — the decision always falls on a hex digit, and `0-9a-f` orders
 * identically under JS UTF-16 code units, Postgres `C`, glibc en_US.UTF-8 and
 * ICU root. Ids need not be time-ordered (uuid v4 is random); they only need a
 * consistent total order on both sides, which this gives.
 */
import type { Prisma } from "@quikit/database";

/** The two fields that together form a stable position in the ascending order. */
export interface MessageCursor {
  createdAt: Date;
  id: string;
}

/**
 * `WHERE` fragment selecting rows strictly OLDER than `cursor` under the
 * (createdAt, id) total order. Merge into the channel-scoped where clause.
 */
export function olderThanCursor(cursor: MessageCursor): Prisma.QcMessageWhereInput {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Newest-first ordering that mirrors the client's ascending sort exactly,
 * reversed. Must stay in lockstep with `sortMessagesAsc`.
 */
export const MESSAGES_ORDER: Prisma.QcMessageOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];
