/**
 * Pure helpers for assignment return/removal side-effects. No DB imports, so
 * they're unit-testable and shared by the assignment route handlers.
 */

/**
 * Status to apply to the asset when its assignment is returned/removed. Only an
 * asset still marked "Assigned" flips back to "Available"; if it has since moved
 * to InRepair/Retired (or anything else), leave it untouched (null = no change),
 * so a return never clobbers a later lifecycle state.
 */
export function assetStatusAfterReturn(currentStatus: string): "Available" | null {
  return currentStatus === "Assigned" ? "Available" : null;
}

/**
 * New request counter/status when one fulfilled unit is returned or its
 * assignment is deleted. Only relevant for physical requests (subscriptions
 * never create assignments). Decrements quantityFulfilled by one (floored at 0);
 * a Fulfilled/PartiallyFulfilled request drops back to PartiallyFulfilled (units
 * still out) or Approved (nothing left fulfilled). Other statuses are unchanged.
 */
export function requestStateAfterUnfulfil(
  quantityFulfilled: number,
  status: string,
): { quantityFulfilled: number; status: string } {
  const next = Math.max(0, quantityFulfilled - 1);
  let nextStatus = status;
  if (status === "Fulfilled" || status === "PartiallyFulfilled") {
    nextStatus = next === 0 ? "Approved" : "PartiallyFulfilled";
  }
  return { quantityFulfilled: next, status: nextStatus };
}
