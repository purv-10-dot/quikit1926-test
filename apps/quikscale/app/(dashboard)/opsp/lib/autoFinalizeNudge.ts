/**
 * Decides whether the OPSP page shows the non-admin "auto-finalize nudge" —
 * the orange banner that tells a member to complete their four per-user
 * sections (Your Accountability / Quarterly Priorities / Critical # / Balanced
 * Critical #) before the OPSP auto-finalizes and locks them.
 *
 * Kept pure (no React / no fetch) so it's unit-testable. The `finalize` input
 * comes straight from the `/api/opsp/deadline` payload.
 *
 * The nudge is intentionally narrow:
 *   - non-admins only (admins finalize manually and edit every section),
 *   - draft only (a finalized/reviewed OPSP is already locked),
 *   - current fiscal quarter only (the period auto-finalize actually targets),
 *   - Mode "A" only — the ONLY deadline mode that truly auto-finalizes. Mode "B"
 *     is a quarter-end reminder that never flips status, so the "auto-finalizes
 *     in N days" wording would be misleading there.
 */

export interface NudgeInput {
  /** Holds the system admin role. */
  isAdmin: boolean;
  /** OPSP status is finalized or reviewed. */
  statusLocked: boolean;
  /** The viewed (year, quarter) is the current fiscal period. */
  isCurrentPeriod: boolean;
  /** `finalize` block from GET /api/opsp/deadline (null when no countdown). */
  finalize: { mode: "A" | "B"; daysLeft: number } | null;
}

/**
 * Returns the day-count to render in the nudge, or `null` when the nudge must
 * be hidden.
 */
export function autoFinalizeNudgeDays(i: NudgeInput): number | null {
  if (i.isAdmin) return null;
  if (i.statusLocked) return null;
  if (!i.isCurrentPeriod) return null;
  if (!i.finalize || i.finalize.mode !== "A") return null;
  if (i.finalize.daysLeft <= 0) return null;
  return i.finalize.daysLeft;
}
