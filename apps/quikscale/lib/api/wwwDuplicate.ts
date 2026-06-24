import type { Prisma, PrismaClient } from "@quikit/database";

/**
 * Deterministic duplicate detection for WWW ("Who/What/When") items.
 *
 * Two independent rules — either one blocks creation/edit (HTTP 409):
 *   • "who-when": a given assignee already has an active item due on the SAME
 *     calendar day. (Dates are day-granular — the form round-trips a date-only
 *     value, so we compare on the UTC day.)
 *   • "name": the `what` text already exists on an active item ANYWHERE in the
 *     org (case- and whitespace-insensitive). Org-wide uniqueness keeps tracking
 *     and reporting unambiguous.
 *
 * Soft-deleted items (`deletedAt != null`) never count as duplicates.
 */

/** Narrow client surface so the helper works with both `db` and a tx client. */
type WWWClient = Pick<PrismaClient, "wWWItem">;

export type WWWDuplicate =
  | { kind: "who-when"; conflictId: string; who: string; when: Date }
  | { kind: "name"; conflictId: string };

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
  const notSelf: Prisma.WWWItemWhereInput = excludeId ? { id: { not: excludeId } } : {};

  // Rule 1 — same assignee + same calendar day.
  if (input.whoIds.length > 0) {
    const range = utcDayRange(input.when);
    const clash = await client.wWWItem.findFirst({
      where: {
        orgId,
        deletedAt: null,
        who: { in: input.whoIds },
        when: { gte: range.gte, lt: range.lt },
        ...notSelf,
      },
      select: { id: true, who: true, when: true },
    });
    if (clash) {
      return { kind: "who-when", conflictId: clash.id, who: clash.who, when: clash.when };
    }
  }

  // Rule 2 — duplicate name (org-wide, case-insensitive). `mode: "insensitive"`
  // covers case; trimming the input covers the common stray-whitespace case.
  const trimmed = input.what.trim();
  if (trimmed) {
    const clash = await client.wWWItem.findFirst({
      where: {
        orgId,
        deletedAt: null,
        what: { equals: trimmed, mode: "insensitive" },
        ...notSelf,
      },
      select: { id: true },
    });
    if (clash) {
      return { kind: "name", conflictId: clash.id };
    }
  }

  return null;
}

/** dd-mm-yyyy in UTC — matches the form's date display. */
function formatDueDate(when: Date): string {
  const dd = String(when.getUTCDate()).padStart(2, "0");
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = when.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Human-facing 409 message for a detected duplicate. For a "who-when" clash the
 * assignee's name is looked up so the message names the person; falls back to a
 * generic phrasing if the user can't be resolved.
 */
export async function wwwDuplicateMessage(
  client: { user: Pick<PrismaClient["user"], "findUnique"> },
  dup: WWWDuplicate,
): Promise<string> {
  if (dup.kind === "name") {
    return "A WWW item with this description already exists. Duplicate names aren't allowed.";
  }
  const user = await client.user.findUnique({
    where: { id: dup.who },
    select: { firstName: true, lastName: true },
  });
  const name = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : "";
  const subject = name || "This person";
  return `${subject} already has a WWW item due on ${formatDueDate(dup.when)}.`;
}
