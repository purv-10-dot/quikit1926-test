"use client";

import { useMemo } from "react";
import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { dailyHuddleAuditConfig, type DailyHuddleAuditEntity } from "@/components/audit/dailyHuddleAuditConfig";

/**
 * Daily Huddle Change History drawer — thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by dailyHuddleAuditConfig. The huddle has no
 * single `name`, so we derive one from the client (the meeting date shows in
 * the period chip).
 */
export function DailyHuddleChangeHistoryPanel({
  huddle,
  onClose,
}: {
  // The page's HuddleRow has no `name` — we derive it from the client below.
  huddle: Omit<DailyHuddleAuditEntity, "name">;
  onClose: () => void;
}) {
  const entity = useMemo<DailyHuddleAuditEntity>(
    () => ({ ...huddle, name: huddle.clientName || "Daily Huddle" }),
    [huddle],
  );
  return <EntityChangeHistoryPanel entity={entity} config={dailyHuddleAuditConfig} onClose={onClose} />;
}
