"use client";

import { useMemo } from "react";
import type { WWWItem } from "@/lib/types/www";
import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { wwwAuditConfig, type WWWAuditEntity } from "@/components/audit/wwwAuditConfig";

/**
 * WWW Change History drawer — a thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by wwwAuditConfig. WWWItem has no `name`
 * field, so we derive one from `what` (the task description) for the header.
 */
export function WWWChangeHistoryPanel({
  item,
  onClose,
}: {
  item: WWWItem;
  onClose: () => void;
}) {
  const entity = useMemo<WWWAuditEntity>(() => ({ ...item, name: item.what || "WWW Item" }), [item]);
  return <EntityChangeHistoryPanel entity={entity} config={wwwAuditConfig} onClose={onClose} />;
}
