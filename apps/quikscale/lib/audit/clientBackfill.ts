/**
 * Client + Client Member backfill mappers — thin wrappers over the generic
 * legacyBackfill (lib/audit/legacyBackfill.ts), pinning entityType + audit
 * fields. Unlike WWW/Priority, the legacy Client/ClientMember PUT stored BOTH
 * oldValues and newValues, so backfilled UPDATEs reconstruct full field diffs.
 */
import { mapLegacyAuditLog, isAggregateLog } from "./legacyBackfill";
import type { LegacyAuditLog, MapContext, MapResult } from "./legacyBackfill";
import { CLIENT_AUDIT_FIELDS } from "./clientFields";
import { CLIENT_MEMBER_AUDIT_FIELDS } from "./clientMemberFields";
import { DAILY_HUDDLE_AUDIT_FIELDS } from "./dailyHuddleFields";

export type { LegacyAuditLog, MapContext, MapResult } from "./legacyBackfill";
export { isAggregateLog };

/** Map one legacy AuditLog row (entityType="Client") to a new "CLIENT" event. */
export function mapClientAuditLog(log: LegacyAuditLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(log, ctx, {
    entityType: "CLIENT",
    auditFields: CLIENT_AUDIT_FIELDS,
  });
}

/** Map one legacy AuditLog row (entityType="ClientMember") to "CLIENT_MEMBER". */
export function mapClientMemberAuditLog(log: LegacyAuditLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(log, ctx, {
    entityType: "CLIENT_MEMBER",
    auditFields: CLIENT_MEMBER_AUDIT_FIELDS,
  });
}

/** Map one legacy AuditLog row (entityType="DailyHuddle") to "DAILY_HUDDLE". */
export function mapDailyHuddleAuditLog(log: LegacyAuditLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(log, ctx, {
    entityType: "DAILY_HUDDLE",
    auditFields: DAILY_HUDDLE_AUDIT_FIELDS,
  });
}
