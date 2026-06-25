/**
 * FR-4.3 — per-rep activity custom-field aggregation (the CrmActivityFieldValue
 * indexed-storage payoff, decision #1).
 *
 * For a chosen activity type, aggregates each field's values across the caller's
 * tier scope, broken down PER REP (matching the existing executive-overview
 * leaderboard pattern):
 *   - Number fields → SUM(valueNumber) per owner (+ team rollup)
 *   - Select/Text fields → COUNT per valueText per owner
 *
 * SCOPE (raw join — bypasses Prisma's relation filter, so scope is written into
 * the WHERE as PARAMETERIZED filters, never concatenated — mirrors team-scope.ts):
 *   - Administrator → org-only ("orgId" = ${orgId})
 *   - SalesManager  → "orgId" = ${orgId} AND "ownerId" = ANY(${memberIds})  [person-scoped]
 *   - SalesUser     → "orgId" = ${orgId} AND "ownerId" = ${self}
 *
 * FLAGS: SalesManager person-scoping is code-verified, runtime-confirmation OWED.
 * Grouping is by CrmActivity.type label elsewhere (FR-4.2); here aggregation is
 * keyed by the field's fieldKey. The dashboard-count vs activity-list-drill-down
 * asymmetry stays flagged. See ACTIVITY-FEATURE-DECISIONS.md.
 */
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";
import type { SessionUser } from "@/types/permission";

export type PerRepFieldAggregate = {
  ownerId: string;
  ownerName: string | null;
  numberSum?: number;
  numberAvg?: number;
  countsByValue?: { value: string; count: number }[];
};

export type ActivityFieldAggregate = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  perRep: PerRepFieldAggregate[];
  teamTotal?: { numberSum?: number };
};

// Raw row shape from the aggregate query (one row per owner × field × value).
type RawAggRow = {
  ownerId: string;
  ownerName: string | null;
  fieldKey: string;
  numberSum: number | null;
  valueText: string | null;
  valueCount: number | null;
};

/**
 * Build the PARAMETERIZED owner-scope SQL fragment for the caller's tier.
 * Every dynamic value is a tagged-template param (Prisma.sql ${}), never
 * concatenated. orgId is ALWAYS filtered (tenant isolation).
 */
async function buildScopeSql(user: SessionUser): Promise<Prisma.Sql> {
  // Administrator → org-only. Checked via the role directly (NOT getScope, which
  // calls resolveTeamScope → the unshipped CrmTeamManager table → a swallowed but
  // log-noisy 42P01 on every non-admin digest scope build). getScope's result was
  // only ever consumed here for the unrestricted flag; this matches getScope's
  // own ADMIN_ROLES check (=== "Administrator") exactly — no behavior change.
  if (user.role === "Administrator") {
    // Administrator → org-only.
    return Prisma.sql`a."orgId" = ${user.orgId}`;
  }

  if (user.role === "SalesManager") {
    const team = await resolveManagerTeam(user);
    const memberIds = team?.memberIds ?? [];
    if (memberIds.length > 0) {
      return Prisma.sql`a."orgId" = ${user.orgId} AND a."ownerId" = ANY(${memberIds}::text[])`;
    }
    // No resolved team → own-only fallback (parity with role-metrics).
    return Prisma.sql`a."orgId" = ${user.orgId} AND a."ownerId" = ${user.userId}`;
  }

  // SalesUser / others → own-only.
  return Prisma.sql`a."orgId" = ${user.orgId} AND a."ownerId" = ${user.userId}`;
}

export async function getActivityFieldAggregates(
  user: SessionUser,
  opts: { activityTypeId: string; range?: { from: Date; to: Date } },
): Promise<ActivityFieldAggregate[]> {
  // Load the type's field defs (org-scoped read) for labels + types.
  const type = await getActivityTypeWithFields(user.orgId, opts.activityTypeId);
  const defs = type?.fieldDefinitions ?? [];
  if (defs.length === 0) return [];

  const scopeSql = await buildScopeSql(user);
  const fieldKeys = defs.map((d) => d.key);

  // Optional window as a PARAMETERIZED fragment (mirrors buildScopeSql — values
  // via Prisma.sql ${}, never concatenated). Omitted → Prisma.empty → the WHERE
  // is byte-identical to the pre-window query (FR-4.3 mock tests stay green).
  // Passed → an ADDITIONAL occurredAt bound on the joined activity; scope
  // filters above are untouched (window is additive, not a replacement).
  const windowSql = opts.range
    ? Prisma.sql`AND a."occurredAt" >= ${opts.range.from} AND a."occurredAt" < ${opts.range.to}`
    : Prisma.empty;

  // Aggregate per (owner, fieldKey, valueText). SUM(valueNumber) covers Number
  // fields; COUNT grouped by valueText covers Select/Text. ownerName is read
  // from the denormalized CrmActivity.ownerName. Join value ⨝ activity so the
  // tier scope (on the activity) applies. All values parameterized.
  const rows = await prisma.$queryRaw<RawAggRow[]>(
    Prisma.sql`
      SELECT a."ownerId"                         AS "ownerId",
             a."ownerName"                       AS "ownerName",
             v."fieldKey"                         AS "fieldKey",
             SUM(v."valueNumber")                AS "numberSum",
             v."valueText"                        AS "valueText",
             COUNT(v."valueText")::int            AS "valueCount"
      FROM   app_quikcrm."CrmActivityFieldValue" v
      JOIN   app_quikcrm."CrmActivity"           a ON a."id" = v."activityId"
      WHERE  v."orgId" = ${user.orgId}
        AND  v."fieldKey" = ANY(${fieldKeys}::text[])
        AND  ${scopeSql}
        ${windowSql}
      GROUP BY a."ownerId", a."ownerName", v."fieldKey", v."valueText"
    `,
  );

  // Shape rows → per-field, per-rep aggregates.
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: ActivityFieldAggregate[] = [];

  for (const def of defs) {
    const fieldRows = rows.filter((r) => r.fieldKey === def.key);
    const isNumber = def.fieldType === "Number";

    // group rows by ownerId
    const perOwner = new Map<string, RawAggRow[]>();
    for (const r of fieldRows) {
      const list = perOwner.get(r.ownerId) ?? [];
      list.push(r);
      perOwner.set(r.ownerId, list);
    }

    const perRep: PerRepFieldAggregate[] = [];
    let teamNumberSum = 0;
    for (const [ownerId, ownerRows] of perOwner) {
      const ownerName = ownerRows[0]?.ownerName ?? null;
      if (isNumber) {
        const sum = ownerRows.reduce((s, r) => s + Number(r.numberSum ?? 0), 0);
        teamNumberSum += sum;
        perRep.push({ ownerId, ownerName, numberSum: sum });
      } else {
        const countsByValue = ownerRows
          .filter((r) => r.valueText != null)
          .map((r) => ({ value: r.valueText as string, count: Number(r.valueCount ?? 0) }));
        perRep.push({ ownerId, ownerName, countsByValue });
      }
    }

    out.push({
      fieldKey: def.key,
      fieldLabel: byKey.get(def.key)?.label ?? def.key,
      fieldType: def.fieldType,
      perRep,
      ...(isNumber ? { teamTotal: { numberSum: teamNumberSum } } : {}),
    });
  }

  return out;
}
