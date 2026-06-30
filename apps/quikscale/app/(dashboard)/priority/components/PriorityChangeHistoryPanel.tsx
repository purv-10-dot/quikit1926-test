"use client";

import type { PriorityRow } from "@/lib/types/priority";
import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { priorityAuditConfig } from "@/components/audit/priorityAuditConfig";

/**
 * Priority Change History drawer — a thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by priorityAuditConfig. Same UX as the KPI
 * panel (the two share one component).
 */
export function PriorityChangeHistoryPanel({
  priority,
  onClose,
}: {
  priority: PriorityRow;
  onClose: () => void;
}) {
  return <EntityChangeHistoryPanel entity={priority} config={priorityAuditConfig} onClose={onClose} />;
}
