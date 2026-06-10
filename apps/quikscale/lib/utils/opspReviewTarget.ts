/**
 * Resolve the Target shown in OPSP Review for one period.
 *
 * The LIVE OPSP source target wins, so post-finalize edits to a category's
 * Projected / period cells reflect immediately in Review. The
 * `OPSPReviewEntry.targetValue` snapshot — captured when the reviewer first
 * entered Achieved — is only a fallback for when the source has no value, so a
 * stale snapshot never masks a newer target. (The Review Target cell is
 * read-only; the snapshot is never user-authored, so the live source is the
 * source of truth.)
 *
 * `null`/`undefined` mean "no value"; `0` is a real target and wins over the
 * snapshot — hence explicit `!= null` checks rather than truthiness.
 */
export function resolveReviewTarget(
  sourceTarget: number | null,
  projected: number | null,
  snapshot: number | null,
): number | null {
  if (sourceTarget != null) return sourceTarget;
  if (projected != null) return projected;
  return snapshot;
}
