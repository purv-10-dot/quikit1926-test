/**
 * WWW lifecycle — the single definition of overdue, carried-forward and closed.
 *
 * WHY DERIVED RATHER THAN STORED
 * ------------------------------
 * The requirement doc asks for OPEN / IN_PROGRESS / COMPLETED / OVERDUE /
 * CARRIED_FORWARD / CANCELLED, and also says not to invent statuses the
 * application does not support. Both hold at once because two of those six are
 * not really statuses:
 *
 *   OVERDUE          is a function of the due date and today. Storing it would
 *                    need a nightly job to keep every row truthful, and any row
 *                    the job missed would be a silent lie.
 *   CARRIED_FORWARD  is a function of the revision history — an item whose due
 *                    date has been moved. `revisedDates` already records that.
 *
 * So the four real states stay in `WWWItem.status` using the five values the UI
 * already renders, and these two are computed. Nothing in `/www`, the filters,
 * the exports, `wwwStats.ts` or QuikFlow's date rules has to change its
 * vocabulary.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * "Overdue" was defined twice, differently, in two applications:
 *
 *   · `app/api/performance/scorecard/route.ts` excluded statuses `"done"` and
 *     `"closed"` — values that exist in NO enum in this repository, so the
 *     exclusion never matched anything — and ignored `dueDateTBD`, meaning
 *     every to-be-decided item counted as overdue the day it was created.
 *   · `apps/quikflow/lib/schedule/date-rules.ts` excluded only `"completed"`,
 *     so a cancelled item still triggered an overdue notification.
 *
 * Two definitions cannot both be right, and a user seeing different overdue
 * counts on the scorecard and in their notifications has no way to tell which
 * to believe. This is now the only definition.
 */

/** The five values the UI can render. Mirrors `lib/constants/status.ts`. */
export const WWW_STORED_STATUSES = [
  "not-applicable",
  "not-yet-started",
  "behind-schedule",
  "on-track",
  "completed",
] as const;

export type WwwStoredStatus = (typeof WWW_STORED_STATUSES)[number];

/**
 * Legacy values still present in live data, mapped to their canonical
 * equivalent.
 *
 * `not-started` is the column DEFAULT and is written by the internal
 * create-www action routes, so it is the most common of the three. None of them
 * appear in `ITEM_STATUS_ORDER`, which means the status `<select>` matches no
 * option and silently falls back to its first — displaying the item as "Not
 * Applicable" regardless of what it actually is. `wwwStats.ts` drops them from
 * its buckets entirely.
 */
export const LEGACY_STATUS_MAP: Record<string, WwwStoredStatus> = {
  "not-started": "not-yet-started",
  "in-progress": "on-track",
  blocked: "behind-schedule",
};

/** Normalise any stored value to a renderable one. */
export function canonicalStatus(status: string | null | undefined): WwwStoredStatus {
  if (!status) return "not-yet-started";
  const s = status.trim().toLowerCase();
  if ((WWW_STORED_STATUSES as readonly string[]).includes(s)) return s as WwwStoredStatus;
  return LEGACY_STATUS_MAP[s] ?? "not-yet-started";
}

/**
 * Statuses that end an item's life.
 *
 * `completed` is done; `not-applicable` is the app's expression of cancelled.
 * Neither can be overdue — an item nobody is waiting for cannot be late.
 */
export const CLOSED_STATUSES: readonly WwwStoredStatus[] = ["completed", "not-applicable"];

export const isClosed = (status: string | null | undefined): boolean =>
  CLOSED_STATUSES.includes(canonicalStatus(status));

/** The minimum an item must expose to have its lifecycle derived. */
export interface WwwLifecycleInput {
  status: string | null;
  when: Date | string | null;
  /** When true, `when` holds a placeholder and no real date has been agreed. */
  dueDateTBD?: boolean | null;
  /** Each entry is one due-date revision. */
  revisedDates?: string[] | null;
  completedAt?: Date | string | null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Is this item overdue as of `now`?
 *
 * Three conditions, all required:
 *   1. the due date has passed;
 *   2. the item is not closed (completed or not-applicable);
 *   3. the due date is REAL.
 *
 * Condition 3 is the one the old scorecard missed. `dueDateTBD` items carry
 * their creation date in `when` as a placeholder — deliberately, so every
 * existing sort and index keeps working — which made them overdue the moment
 * they were created. An item explicitly marked "to be decided" cannot be late
 * for a date nobody has agreed.
 *
 * Compared at day granularity: an item due today is not overdue until tomorrow.
 * Comparing timestamps would make an item due "today" overdue from 00:00,
 * which is not what a due date means to the person who set it.
 */
export function isOverdue(item: WwwLifecycleInput, now: Date = new Date()): boolean {
  if (isClosed(item.status)) return false;
  if (item.dueDateTBD) return false;

  const due = asDate(item.when);
  if (!due) return false;

  return startOfDay(due) < startOfDay(now);
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Has this item's due date been moved?
 *
 * `revisedDates` is the existing mechanism — the WWW table writes to it when a
 * user revises a date. A revision is the app's record of a commitment slipping,
 * which is precisely what "carried forward" describes in the report.
 */
export function isCarriedForward(item: WwwLifecycleInput): boolean {
  return (item.revisedDates?.length ?? 0) > 0;
}

/** Days between the due date and now. Negative means still ahead of time. */
export function daysOverdue(item: WwwLifecycleInput, now: Date = new Date()): number | null {
  const due = asDate(item.when);
  if (!due || item.dueDateTBD) return null;
  return Math.round((startOfDay(now) - startOfDay(due)) / 86_400_000);
}

/** Days from creation to completion. Null while the item is still open. */
export function daysToClose(
  item: WwwLifecycleInput & { createdAt?: Date | string | null },
): number | null {
  const created = asDate(item.createdAt);
  const closed = asDate(item.completedAt);
  if (!created || !closed) return null;
  return Math.max(0, Math.round((startOfDay(closed) - startOfDay(created)) / 86_400_000));
}

/**
 * The requirement doc's six lifecycle labels, derived.
 *
 * Reporting order matters: OVERDUE outranks the working states, because an
 * overdue item is the one the facilitator needs to see regardless of whether
 * someone marked it on-track.
 */
export type WwwLifecycle =
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE"
  | "CANCELLED";

export interface DerivedLifecycle {
  lifecycle: WwwLifecycle;
  /** Orthogonal to `lifecycle`: an item can be carried forward AND overdue. */
  carriedForward: boolean;
  overdue: boolean;
  daysOverdue: number | null;
  storedStatus: WwwStoredStatus;
}

export function deriveLifecycle(
  item: WwwLifecycleInput,
  now: Date = new Date(),
): DerivedLifecycle {
  const storedStatus = canonicalStatus(item.status);
  const overdue = isOverdue(item, now);

  let lifecycle: WwwLifecycle;
  if (storedStatus === "completed") lifecycle = "COMPLETED";
  else if (storedStatus === "not-applicable") lifecycle = "CANCELLED";
  else if (overdue) lifecycle = "OVERDUE";
  else if (storedStatus === "on-track" || storedStatus === "behind-schedule") {
    lifecycle = "IN_PROGRESS";
  } else lifecycle = "OPEN";

  return {
    lifecycle,
    // Orthogonal on purpose: "carried forward and now overdue" is a real and
    // important state, and collapsing it into one label would hide half of it.
    carriedForward: isCarriedForward(item),
    overdue,
    daysOverdue: overdue ? daysOverdue(item, now) : null,
    storedStatus,
  };
}

/**
 * Prisma `where` fragment selecting overdue items.
 *
 * Mirrors `isOverdue` exactly. Kept beside it so the two cannot drift — a SQL
 * filter that disagrees with the in-memory predicate would make a filtered list
 * and its own row badges contradict each other.
 */
export function overdueWhere(now: Date = new Date()) {
  return {
    when: { lt: new Date(startOfDay(now)) },
    dueDateTBD: false,
    status: { notIn: [...CLOSED_STATUSES, ...legacyClosedAliases()] },
  };
}

/**
 * Legacy spellings of the closed statuses.
 *
 * There are none today — no legacy value maps to `completed` or
 * `not-applicable` — but the SQL filter cannot call `canonicalStatus`, so this
 * documents the join point explicitly rather than leaving a silent assumption
 * that the two lists agree.
 */
function legacyClosedAliases(): string[] {
  return Object.entries(LEGACY_STATUS_MAP)
    .filter(([, canonical]) => CLOSED_STATUSES.includes(canonical))
    .map(([legacy]) => legacy);
}

export interface LifecycleMetrics {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  carriedForward: number;
  completionRate: number | null;
  overdueRate: number | null;
  carryForwardRate: number | null;
  averageDaysToClose: number | null;
}

/**
 * Portfolio metrics for the Monthly Report's WWW section.
 *
 * Rates exclude cancelled items from the denominator: an item withdrawn was
 * never a commitment anybody failed to meet, and counting it would understate
 * completion for teams that tidy up properly.
 */
export function computeLifecycleMetrics(
  items: (WwwLifecycleInput & { createdAt?: Date | string | null })[],
  now: Date = new Date(),
): LifecycleMetrics {
  const derived = items.map((i) => ({ item: i, d: deriveLifecycle(i, now) }));

  const count = (l: WwwLifecycle) => derived.filter((x) => x.d.lifecycle === l).length;
  const completed = count("COMPLETED");
  const cancelled = count("CANCELLED");
  const overdue = derived.filter((x) => x.d.overdue).length;
  const carriedForward = derived.filter((x) => x.d.carriedForward).length;

  const commitments = derived.length - cancelled;
  const rate = (n: number) =>
    commitments > 0 ? Math.round((n / commitments) * 1000) / 10 : null;

  const closureDays = derived
    .map((x) => daysToClose(x.item))
    .filter((n): n is number => n !== null);

  return {
    total: derived.length,
    open: count("OPEN"),
    inProgress: count("IN_PROGRESS"),
    completed,
    cancelled,
    overdue,
    carriedForward,
    completionRate: rate(completed),
    overdueRate: rate(overdue),
    carryForwardRate: rate(carriedForward),
    averageDaysToClose:
      closureDays.length > 0
        ? Math.round(
            (closureDays.reduce((a, b) => a + b, 0) / closureDays.length) * 10,
          ) / 10
        : null,
  };
}
