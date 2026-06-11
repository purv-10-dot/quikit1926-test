"use client";

import { useMemo } from "react";
import {
  EntityChangeHistoryPanel,
  type AuditEntityConfig,
} from "@/components/audit/EntityChangeHistoryPanel";
import { weeklyMeetingAuditConfig, type WeeklyMeetingAuditEntity } from "@/components/audit/weeklyMeetingAuditConfig";

/**
 * Weekly Meeting Change History drawer — thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by weeklyMeetingAuditConfig.
 *
 * `nameById` resolves clientMember ids → names for the "Absent Members" /
 * "Dashboard N/A Members" diffs, covering MIGRATED entries whose AuditChange
 * rows store raw ids. Live edits store names and pass through unchanged.
 */
export function WeeklyMeetingChangeHistoryPanel({
  meeting,
  nameById,
  onClose,
}: {
  // The page's MeetingRow has no `name` — derived from the client below.
  meeting: Omit<WeeklyMeetingAuditEntity, "name">;
  nameById?: Map<string, string>;
  onClose: () => void;
}) {
  const entity = useMemo<WeeklyMeetingAuditEntity>(
    () => ({ ...meeting, name: meeting.clientName || "Weekly Meeting" }),
    [meeting],
  );

  const memberFields = ["absentClientMemberIds", "dashboardNAClientMemberIds"];
  const config = useMemo<AuditEntityConfig<WeeklyMeetingAuditEntity>>(
    () => ({
      ...weeklyMeetingAuditConfig,
      formatFieldValue: (field, value) => {
        const base = weeklyMeetingAuditConfig.formatFieldValue?.(field, value);
        if (base !== undefined) return base;
        if (memberFields.includes(field) && value != null) {
          const s = String(value);
          return nameById?.get(s) ?? s;
        }
        return undefined;
      },
    }),
    [nameById],
  );

  return <EntityChangeHistoryPanel entity={entity} config={config} onClose={onClose} />;
}
