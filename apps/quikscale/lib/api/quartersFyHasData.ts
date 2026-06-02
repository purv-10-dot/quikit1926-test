/**
 * Shared helper — does the given org have any "lockable" data for a fiscal
 * year? Used by:
 *   - GET  /api/org/quarters         → builds `hasDataByYear` map for UI
 *   - PUT  /api/org/quarters/[id]    → rejects start-date edit when true
 *   - DELETE /api/org/quarters/[id]  → rejects per-quarter delete when true
 *   - DELETE /api/org/quarters?year= → rejects whole-FY delete when true
 *
 * "Lockable" data = KPI, Priority, or OPSPData rows pinned to that FY.
 * (WWWItem has no `year` column — uses a `when` DateTime — so it is NOT
 * included in this check. If WWW lock is needed later, derive FY from
 * `when` against the matching QuarterSetting date range.)
 *
 * Keeping the three-count fan-out in one place ensures the UI and the
 * server-side enforcement stay in lockstep — changing the policy means
 * editing exactly one function.
 */
import { db } from "@/lib/db";

export async function fyHasData(orgId: string, fiscalYear: number): Promise<boolean> {
  const [kpiCount, priorityCount, opspCount] = await Promise.all([
    db.kPI.count({ where: { orgId, year: fiscalYear, deletedAt: null } }),
    db.priority.count({ where: { orgId, year: fiscalYear, deletedAt: null } }),
    db.oPSPData.count({ where: { orgId, year: fiscalYear } }),
  ]);
  return kpiCount > 0 || priorityCount > 0 || opspCount > 0;
}

/** Human label for error messages and banners. */
export function fyLabel(fiscalYear: number): string {
  return `FY ${fiscalYear}-${String(fiscalYear + 1).slice(-2)}`;
}
