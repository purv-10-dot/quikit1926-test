/**
 * Shared helpers for resolving `createdBy` / `updatedBy` user IDs into
 * display name + initials for table audit columns.
 *
 * Used by:
 *   /api/kpi              /api/priority           /api/www
 *   /api/client-meetings/clients
 *   /api/client-meetings/daily-huddles
 *   /api/client-meetings/weekly-meetings
 *   /api/client-meetings/members  (already inline — kept for consistency)
 *
 * Centralising this avoids divergent edge-cases (null guards, initials
 * fallback) across module endpoints and means policy changes (e.g. show
 * email instead of name) live in one place.
 */
import { db } from "@/lib/db";

export interface AuditUserInfo {
  name: string;
  initials: string;
}

export type AuditUserMap = Record<string, AuditUserInfo>;

/** Batch-resolves every unique `createdBy`/`updatedBy` id in a row set. */
export async function fetchAuditUserMap(
  rows: ReadonlyArray<{ createdBy?: string | null; updatedBy?: string | null }>,
): Promise<AuditUserMap> {
  const ids = [
    ...new Set(
      rows.flatMap((r) =>
        [r.createdBy, r.updatedBy].filter((x): x is string => !!x),
      ),
    ),
  ];
  if (ids.length === 0) return {};
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  const map: AuditUserMap = {};
  for (const u of users) {
    map[u.id] = toAuditInfo(u.firstName, u.lastName);
  }
  return map;
}

export function toAuditInfo(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): AuditUserInfo {
  const fn = firstName ?? "";
  const ln = lastName ?? "";
  return {
    name: `${fn} ${ln}`.trim() || "—",
    initials: `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase() || "??",
  };
}

/** Decorated audit fields appended to every row by `decorateAudit`. */
export interface AuditFields {
  createdByName: string;
  createdByInitials: string;
  updatedByName: string | null;
  updatedByInitials: string | null;
}

/**
 * Resolves the `createdBy`/`updatedBy` ids on a row to name/initials using
 * the provided map. Pass `row` and the previously-built `AuditUserMap`.
 */
export function decorateAudit<
  T extends { createdBy?: string | null; updatedBy?: string | null },
>(row: T, map: AuditUserMap): T & AuditFields {
  const cb = row.createdBy ? map[row.createdBy] : null;
  const ub = row.updatedBy ? map[row.updatedBy] : null;
  return {
    ...row,
    createdByName: cb?.name ?? "—",
    createdByInitials: cb?.initials ?? "??",
    updatedByName: ub?.name ?? null,
    updatedByInitials: ub?.initials ?? null,
  };
}
