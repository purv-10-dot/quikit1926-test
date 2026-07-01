"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { clientFieldLabel } from "@/lib/audit/clientFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { useEntityAuditTimeline, useEntityMarkRead } from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** Minimal Client shape the panel + create card read (the page's ClientRow is
 *  structurally assignable to this). */
export type ClientAuditEntity = {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  startDate?: string | null;
  weeklyStartTime?: string | null;
  weeklyEndTime?: string | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  teamMembers?: Array<{ id: string; name: string; email?: string }>;
};

function window(start?: string | null, end?: string | null): string | null {
  if (!start && !end) return null;
  return `${start ?? "—"} – ${end ?? "—"}`;
}

/**
 * Client Master entity config. Single-row entity (no weekly sub-rows, no
 * comments). `isActive` surfaces as a teal STATUS pill reading Active/Inactive.
 */
export const clientAuditConfig: AuditEntityConfig<ClientAuditEntity> = {
  entityType: "CLIENT",
  badgeLabel: "CLIENT",
  badgeColor: PILLAR_TOKENS.cadence,
  dialogLabel: "Client change history",
  exportPrefix: "client",
  fieldLabel: clientFieldLabel,
  // No natural period chip for a client.
  operationFor: (action) => (action === "STATUS_CHANGE" ? "STATUS" : undefined),
  formatFieldValue: (field, value) =>
    field === "isActive" ? (value ? "Active" : "Inactive") : undefined,
  useTimeline: (id) => useEntityAuditTimeline("CLIENT", id),
  useMarkRead: () => useEntityMarkRead("CLIENT"),
  useWeekLabels: () => [],
  statusDot: (c) =>
    c.isActive
      ? { className: "bg-green-500", label: "Status indicator: Active" }
      : { className: "bg-gray-400", label: "Status indicator: Inactive" },
  renderCreateCard: ({ entity, open, onToggle }) => (
    <ClientCreateCard client={entity} open={open} onToggle={onToggle} />
  ),
};

function ClientCreateCard({
  client,
  open,
  onToggle,
}: {
  client: ClientAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const members = (client.teamMembers ?? []).map((m) => m.name).filter(Boolean).join(", ");
  const fields: [string, unknown][] = [
    ["Client Name", client.name],
    ["Status", client.isActive === false ? "Inactive" : "Active"],
    ["Description", client.description],
    ["Daily Window", window(client.dailyStartTime, client.dailyEndTime)],
    ["Weekly Window", window(client.weeklyStartTime, client.weeklyEndTime)],
    ["Team Members", members || null],
  ];

  return (
    <div>
      <button type="button" onClick={onToggle} className="mb-1 flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "Show"} details
      </button>
      {open && (
        <div className="space-y-1 text-sm">
          {fields
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([label, v]) => (
              <div key={label} className="flex gap-2">
                <span className="w-32 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
