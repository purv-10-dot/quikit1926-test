/**
 * Scroll utilities shared by the dashboard infinite-scroll tables.
 */

/**
 * True when a scroll container is within `threshold` px of its bottom edge —
 * the trigger point for fetching the next infinite-scroll page. Centralized
 * (and pure) so the three dashboard tables share one tested implementation.
 *
 * @param el         the scrolled element (`e.currentTarget` of an onScroll)
 * @param threshold  px from the bottom that counts as "near" (default 120)
 */
export function isNearBottom(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold = 120,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}
