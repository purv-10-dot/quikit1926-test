/**
 * Weekly Meeting backfill mapper. Unlike the other modules (whose legacy logs
 * live in the generic `AuditLog`), Weekly Meeting wrote to its own domain table
 * `ClientWeeklyMeetingLog` (different column names). This adapts a domain-log
 * row to the generic LegacyAuditLog shape and reuses the shared mapper, pinning
 * entityType="WEEKLY_MEETING".
 *
 * The domain log stored FULL old+new JSON snapshots on UPDATE, so backfilled
 * UPDATEs reconstruct real field diffs (richer than Daily Huddle's). Legacy
 * SCORE_UPDATE rows fall through to the generic "unknown action" path → an
 * UPDATE event carrying the forensic snapshot.
 */
import { mapLegacyAuditLog } from "./legacyBackfill";
import type { MapContext, MapResult } from "./legacyBackfill";
import { WEEKLY_MEETING_AUDIT_FIELDS } from "./weeklyMeetingFields";

export type { MapContext, MapResult } from "./legacyBackfill";

export interface DomainWeeklyMeetingLog {
  id: string;
  orgId: string;
  meetingId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  reason: string | null;
  createdAt: Date | string;
}

/** Map one legacy ClientWeeklyMeetingLog row to a new "WEEKLY_MEETING" event. */
export function mapWeeklyMeetingLog(log: DomainWeeklyMeetingLog, ctx: MapContext): MapResult {
  return mapLegacyAuditLog(
    {
      id: log.id,
      orgId: log.orgId,
      entityId: log.meetingId,
      action: log.action,
      oldValues: log.oldValue,
      newValues: log.newValue,
      actorId: log.changedBy,
      reason: log.reason,
      createdAt: log.createdAt,
    },
    ctx,
    { entityType: "WEEKLY_MEETING", auditFields: WEEKLY_MEETING_AUDIT_FIELDS },
  );
}
