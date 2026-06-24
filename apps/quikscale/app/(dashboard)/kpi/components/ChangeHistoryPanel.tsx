"use client";

import type { KPIRow } from "@/lib/types/kpi";
import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { kpiAuditConfig } from "@/components/audit/kpiAuditConfig";

interface Props {
  kpi: KPIRow;
  onClose: () => void;
}

/**
 * KPI Change History drawer — a thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by kpiAuditConfig. All the timeline chrome,
 * diff rendering, search/tabs/export, etc. live in the shared component so KPI
 * and Priority (and future entities) stay in lock-step.
 */
export function ChangeHistoryPanel({ kpi, onClose }: Props) {
  return <EntityChangeHistoryPanel entity={kpi} config={kpiAuditConfig} onClose={onClose} />;
}
