/**
 * Priority backfill mapper — a thin wrapper over the generic legacyBackfill
 * (lib/audit/legacyBackfill.ts), pinning entityType="PRIORITY" and the Priority
 * audit-field whitelist. Keeps its original public API so the runner
 * (scripts/backfill-priority-audit.ts) and tests are unaffected.
 */
import { mapLegacyAuditLog, isAggregateLog } from "./legacyBackfill";
import type { LegacyAuditLog, MapContext, MapResult } from "./legacyBackfill";
import { PRIORITY_AUDIT_FIELDS } from "./priorityFields";

export type { LegacyAuditLog, MapContext, MapResult, MappedAuditEvent, MappedAuditChange } from "./legacyBackfill";
export { isAggregateLog };

/** Map one legacy AuditLog row (entityType="Priority") to a new event. */
export function mapPriorityAuditLog(log: LegacyAuditLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(log, ctx, {
    entityType: "PRIORITY",
    auditFields: PRIORITY_AUDIT_FIELDS,
  });
}
