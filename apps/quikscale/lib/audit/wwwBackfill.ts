/**
 * WWW backfill mapper — a thin wrapper over the generic legacyBackfill
 * (lib/audit/legacyBackfill.ts), pinning entityType="WWW" and the WWW
 * audit-field whitelist. The legacy AuditLog rows use entityType="WWWItem";
 * the runner filters on that and this mapper writes the new "WWW" events.
 */
import { mapLegacyAuditLog, isAggregateLog } from "./legacyBackfill";
import type { LegacyAuditLog, MapContext, MapResult } from "./legacyBackfill";
import { WWW_AUDIT_FIELDS } from "./wwwFields";

export type { LegacyAuditLog, MapContext, MapResult } from "./legacyBackfill";
export { isAggregateLog };

/** Map one legacy AuditLog row (entityType="WWWItem") to a new "WWW" event. */
export function mapWWWAuditLog(log: LegacyAuditLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(log, ctx, {
    entityType: "WWW",
    auditFields: WWW_AUDIT_FIELDS,
  });
}
