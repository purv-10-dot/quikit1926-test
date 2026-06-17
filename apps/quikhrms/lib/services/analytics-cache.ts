import { prisma } from "@/lib/prisma";

/**
 * Compensation analytics, computed on demand per request (no Redis). Queries
 * are `orgId`-scoped and bounded.
 *
 * Table names are schema-qualified ("app_quikhrms"."…"). The Prisma schema uses
 * multiSchema, and our DATABASE_URL points at the Neon pooler — the search_path
 * Prisma sets at connect time does NOT persist across pooled connections, so an
 * unqualified `$queryRaw` table reference fails with 42P01 (relation does not
 * exist). Prisma Client model calls qualify automatically; raw SQL must too.
 */

export interface CompensationAnalytics {
  totalCompensation: number;
  highestCompensation: { name: string; total: number } | null;
  lowestCompensation: { name: string; total: number } | null;
  byDepartment: Array<{ id: string; name: string; total: number }>;
  byLocation: Array<{ id: string; name: string; total: number }>;
  refreshedAt: string;
}

interface GroupRow {
  id: string;
  name: string;
  total: bigint | number;
  count: bigint | number;
}
interface MinMaxRow {
  name: string;
  total: bigint | number;
}

const toN = (v: bigint | number | null): number => (v == null ? 0 : Number(v));

/** Run the heavy compensation SQL for one tenant. Returns the computed payload. */
export async function computeCompensationAnalytics(
  orgId: string,
): Promise<CompensationAnalytics> {
  const [byDeptRaw, byLocRaw, totals, highest, lowest] = await Promise.all([
    prisma.$queryRaw<GroupRow[]>`
      SELECT
        COALESCE(d.id, 'unassigned') AS id,
        COALESCE(d.name, 'Unassigned') AS name,
        SUM(es.ctc)::bigint AS total,
        COUNT(*)::bigint AS count
      FROM "app_quikhrms"."EmployeeSalary" es
      JOIN "app_quikhrms"."Employee" e ON e.id = es."employeeId"
      LEFT JOIN "app_quikhrms"."Department" d ON d.id = e."departmentId"
      WHERE es."orgId" = ${orgId}
        AND es."deletedAt" IS NULL
        AND es."isActive" = true
        AND e."deletedAt" IS NULL
      GROUP BY d.id, d.name
      ORDER BY total DESC
    `,
    prisma.$queryRaw<GroupRow[]>`
      SELECT
        COALESCE(l.id, 'unassigned') AS id,
        COALESCE(l.name, 'Unassigned') AS name,
        SUM(es.ctc)::bigint AS total,
        COUNT(*)::bigint AS count
      FROM "app_quikhrms"."EmployeeSalary" es
      JOIN "app_quikhrms"."Employee" e ON e.id = es."employeeId"
      LEFT JOIN "app_quikhrms"."OfficeLocation" l ON l.id = e."officeLocationId"
      WHERE es."orgId" = ${orgId}
        AND es."deletedAt" IS NULL
        AND es."isActive" = true
        AND e."deletedAt" IS NULL
      GROUP BY l.id, l.name
      ORDER BY total DESC
    `,
    prisma.$queryRaw<Array<{ total: bigint | number | null }>>`
      SELECT SUM(es.ctc)::bigint AS total
      FROM "app_quikhrms"."EmployeeSalary" es
      JOIN "app_quikhrms"."Employee" e ON e.id = es."employeeId"
      WHERE es."orgId" = ${orgId}
        AND es."deletedAt" IS NULL
        AND es."isActive" = true
        AND e."deletedAt" IS NULL
    `,
    prisma.$queryRaw<MinMaxRow[]>`
      SELECT (e."firstName" || ' ' || e."lastName") AS name, es.ctc::bigint AS total
      FROM "app_quikhrms"."EmployeeSalary" es
      JOIN "app_quikhrms"."Employee" e ON e.id = es."employeeId"
      WHERE es."orgId" = ${orgId}
        AND es."deletedAt" IS NULL
        AND es."isActive" = true
        AND e."deletedAt" IS NULL
      ORDER BY es.ctc DESC
      LIMIT 1
    `,
    prisma.$queryRaw<MinMaxRow[]>`
      SELECT (e."firstName" || ' ' || e."lastName") AS name, es.ctc::bigint AS total
      FROM "app_quikhrms"."EmployeeSalary" es
      JOIN "app_quikhrms"."Employee" e ON e.id = es."employeeId"
      WHERE es."orgId" = ${orgId}
        AND es."deletedAt" IS NULL
        AND es."isActive" = true
        AND e."deletedAt" IS NULL
      ORDER BY es.ctc ASC
      LIMIT 1
    `,
  ]);

  return {
    totalCompensation: toN(totals[0]?.total ?? 0),
    highestCompensation: highest[0] ? { name: highest[0].name, total: toN(highest[0].total) } : null,
    lowestCompensation: lowest[0] ? { name: lowest[0].name, total: toN(lowest[0].total) } : null,
    byDepartment: byDeptRaw.map((r) => ({ id: r.id, name: r.name, total: toN(r.total) })),
    byLocation: byLocRaw.map((r) => ({ id: r.id, name: r.name, total: toN(r.total) })),
    refreshedAt: new Date().toISOString(),
  };
}
