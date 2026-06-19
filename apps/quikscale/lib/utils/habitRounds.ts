/**
 * Round numbering for habit campaigns.
 *
 * Multiple campaigns per (quarter, year) are allowed — each one is a "round"
 * (a fresh pulse-check). Round numbers are derived from `createdAt` order
 * within the (quarter, year) bucket: the earliest created row is Round 1,
 * the next Round 2, etc. Closing a round + opening another bumps the count.
 *
 * Legacy rows (pre-rebuild single-user assessments) are always (1 of 1) —
 * the round suffix only makes sense for multi-round series, and legacy data
 * predates that concept.
 */

type RoundInput = {
  id: string;
  quarter: string;
  year: number;
  createdAt: Date;
  isLegacy: boolean;
};

export function annotateRounds<T extends RoundInput>(
  rows: T[],
): Array<T & { round: number; totalRounds: number }> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    if (r.isLegacy) continue;
    const key = `${r.year}::${r.quarter}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const positions = new Map<string, { round: number; total: number }>();
  for (const [, arr] of groups) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    arr.forEach((row, idx) =>
      positions.set(row.id, { round: idx + 1, total: arr.length }),
    );
  }
  return rows.map((r) => {
    if (r.isLegacy) return { ...r, round: 1, totalRounds: 1 };
    const p = positions.get(r.id) ?? { round: 1, total: 1 };
    return { ...r, round: p.round, totalRounds: p.total };
  });
}

/**
 * Compute the round number for a single campaign, given the total list of
 * non-legacy rows in the same (quarter, year). Used by detail endpoints
 * that fetch a single row but still want to render "Round N of M".
 */
export async function computeRoundFor(
  loadSiblings: () => Promise<Array<{ id: string; createdAt: Date }>>,
  campaignId: string,
): Promise<{ round: number; totalRounds: number }> {
  const siblings = await loadSiblings();
  siblings.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const idx = siblings.findIndex((s) => s.id === campaignId);
  if (idx < 0) return { round: 1, totalRounds: 1 };
  return { round: idx + 1, totalRounds: siblings.length };
}
