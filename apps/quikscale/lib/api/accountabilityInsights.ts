/**
 * Insights computed from the flat list of accountability-function rows.
 * Used by GET /api/face and GET /api/pace to power the header tiles
 * + system-flag chips on each card.
 *
 * Counts include sub-functions in the totals — every row that has an
 * assigned owner counts toward "accountableCount"; every row without one
 * counts toward "emptySeatsCount". This matches the Scaling Up framing
 * of "empty seats" (any function nobody is on the hook for).
 */
import type { AccountabilityInsights } from "@/lib/schemas/accountabilitySchema";

type FunctionRowLite = {
  id: string;
  assignedToUserId: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
};

export function computeAccountabilityInsights(functions: FunctionRowLite[]): AccountabilityInsights {
  const totalFunctions = functions.length;
  const accountableCount = functions.filter((f) => f.assignedToUserId).length;
  const emptySeatsCount = totalFunctions - accountableCount;

  // Group by ownerId → list of functionIds
  const seatsByOwner = new Map<string, { fn: FunctionRowLite["assignedTo"]; functionIds: string[] }>();
  for (const f of functions) {
    if (!f.assignedToUserId || !f.assignedTo) continue;
    const entry = seatsByOwner.get(f.assignedToUserId) ?? { fn: f.assignedTo, functionIds: [] };
    entry.functionIds.push(f.id);
    seatsByOwner.set(f.assignedToUserId, entry);
  }

  const overloadedOwners = Array.from(seatsByOwner.entries())
    .filter(([, v]) => v.functionIds.length > 1)
    .map(([userId, v]) => ({
      userId,
      firstName:   v.fn!.firstName,
      lastName:    v.fn!.lastName,
      seatCount:   v.functionIds.length,
      functionIds: v.functionIds,
    }))
    .sort((a, b) => b.seatCount - a.seatCount);

  return { totalFunctions, accountableCount, emptySeatsCount, overloadedOwners };
}
