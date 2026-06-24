import type { Prisma, PrismaClient } from "@quikit/database";

/**
 * Deterministic duplicate detection for Priorities.
 *
 * A Priority is a duplicate when an existing ACTIVE priority in the same org
 * shares ALL of the user-meaningful identity fields:
 *
 *   • name       — case- and whitespace-insensitive (the form round-trips a
 *                  trimmed string; "Hire QA" and "  hire qa " are the same).
 *   • owner       — same assignee.
 *   • teamId      — same team (or both "No team" → null).
 *   • quarter+year — same planning PERIOD. Year matters: Q1·FY2026 and
 *                    Q1·FY2027 are different periods, NOT duplicates.
 *   • startWeek   — same start week within that period.
 *
 * This is a hard block (HTTP 409) on the manual "Add New Priority" form. The
 * OPSP "Export → Priority" flow has its own AI-advisory + Replace handling and
 * is intentionally exempt (callers skip this check when importedFromOpsp).
 *
 * Soft-deleted priorities (`deletedAt != null`) never count as duplicates.
 */

/** Narrow client surface so the helper works with both `db` and a tx client. */
type PriorityClient = Pick<PrismaClient, "priority">;

export interface PriorityDuplicateInput {
  /** Priority name as typed (trimmed + lower-cased internally). */
  name: string;
  /** Resolved owner user id. */
  owner: string;
  /** Team id, or null for "No team". */
  teamId: string | null;
  /** Fiscal quarter, e.g. "Q1". */
  quarter: string;
  /** Fiscal year. */
  year: number;
  /** Start week (1–13), or null when not set. */
  startWeek: number | null;
}

/**
 * Returns `{ conflictId }` for the first matching active priority, or null when
 * the priority is unique. `excludeId` is the row being edited so it never
 * collides with itself (unused by create today; ready for a future edit guard).
 */
export async function findPriorityDuplicate(
  client: PriorityClient,
  orgId: string,
  input: PriorityDuplicateInput,
  excludeId?: string,
): Promise<{ conflictId: string } | null> {
  const trimmed = input.name.trim();
  if (!trimmed) return null;

  const notSelf: Prisma.PriorityWhereInput = excludeId ? { id: { not: excludeId } } : {};

  const clash = await client.priority.findFirst({
    where: {
      orgId,
      deletedAt: null,
      name: { equals: trimmed, mode: "insensitive" },
      owner: input.owner,
      teamId: input.teamId, // null-safe: matches "No team" against "No team"
      quarter: input.quarter,
      year: input.year,
      startWeek: input.startWeek,
      ...notSelf,
    },
    select: { id: true },
  });

  return clash ? { conflictId: clash.id } : null;
}

/** Human-facing 409 message for a detected duplicate. */
export function priorityDuplicateMessage(): string {
  return "A priority with the same name, owner, team, start week and quarter already exists for this period.";
}
