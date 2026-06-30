import type { Prisma, PrismaClient } from "@quikit/database";

/**
 * Deterministic duplicate detection for WWW ("Who/What/When") items.
 *
 * A single rule blocks creation/edit (HTTP 409): an existing active item matches
 * on ALL THREE fields —
 *   • who:  the same assignee (any of the new item's `whoIds`), AND
 *   • when: the same calendar day (dates are day-granular — the form round-trips
 *           a date-only value, so we compare on the UTC day), AND
 *   • what: the same task text (trimmed, case-insensitive).
 *
 * So the same person CAN have several items due on one day as long as the "What?"
 * differs, and the same "What?" CAN recur for a different person/day — only an
 * exact who+when+what repeat is a duplicate.
 *
 * Soft-deleted items (`deletedAt != null`) never count as duplicates.
 */

/** Narrow client surface so the helper works with both `db` and a tx client. */
type WWWClient = Pick<PrismaClient, "wWWItem">;

export interface WWWDuplicate {
  conflictId: string;
  /** Assignee of the existing clashing item (for the message). */
  who: string;
  /** Due date of the existing clashing item (for the message). */
  when: Date;
  /** "What?" text of the existing clashing item (for the message). */
  what: string;
}

export interface WWWDuplicateInput {
  /** Resolved assignee ids the new/edited item will belong to. */
  whoIds: string[];
  /** The "What?" text. */
  what: string;
  /** The "When?" due date — ISO string or Date. */
  when: string | Date;
}

/** Inclusive start / exclusive end of the UTC calendar day containing `d`. */
export function utcDayRange(d: string | Date): { gte: Date; lt: Date } {
  const base = typeof d === "string" ? new Date(d) : d;
  const gte = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/**
 * Returns the first duplicate found, or null if the item is unique.
 * `excludeId` is the item being edited (so it never collides with itself).
 */
export async function findWWWDuplicate(
  client: WWWClient,
  orgId: string,
  input: WWWDuplicateInput,
  excludeId?: string,
): Promise<WWWDuplicate | null> {
  const trimmed = input.what.trim();
  // Need all three identity fields to compare. No assignee or no "What?" text
  // means there's nothing to collide against — treat as unique.
  if (input.whoIds.length === 0 || !trimmed) return null;

  const notSelf: Prisma.WWWItemWhereInput = excludeId ? { id: { not: excludeId } } : {};
  const range = utcDayRange(input.when);

  // Single combined rule — same assignee AND same calendar day AND same "What?"
  // (case- and whitespace-insensitive).
  const clash = await client.wWWItem.findFirst({
    where: {
      orgId,
      deletedAt: null,
      who: { in: input.whoIds },
      when: { gte: range.gte, lt: range.lt },
      what: { equals: trimmed, mode: "insensitive" },
      ...notSelf,
    },
    select: { id: true, who: true, when: true, what: true },
  });

  return clash
    ? { conflictId: clash.id, who: clash.who, when: clash.when, what: clash.what }
    : null;
}

/** dd-mm-yyyy in UTC — matches the form's date display. */
function formatDueDate(when: Date): string {
  const dd = String(when.getUTCDate()).padStart(2, "0");
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = when.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Human-facing 409 message for a detected duplicate. The assignee's name is
 * looked up so the message names the person; it also quotes the task and date so
 * it's clear this is an exact who+when+what repeat (not just a same-day clash).
 */
export async function wwwDuplicateMessage(
  client: { user: Pick<PrismaClient["user"], "findUnique"> },
  dup: WWWDuplicate,
): Promise<string> {
  const user = await client.user.findUnique({
    where: { id: dup.who },
    select: { firstName: true, lastName: true },
  });
  const name = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : "";
  const subject = name || "This person";
  return `${subject} already has the same WWW item ("${dup.what}") due on ${formatDueDate(dup.when)}.`;
}
