"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { WWWItem } from "@/lib/types/www";
import { wwwFieldLabel } from "@/lib/audit/wwwFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { statusDotColor, statusLabel } from "@/lib/constants/status";
import { useEntityAuditTimeline, useEntityMarkRead } from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** WWW entity for the panel — the item plus a derived `name` (its `what`). */
export type WWWAuditEntity = WWWItem & { name: string };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * WWW entity config for the generic Change History panel. WWW is a single-row
 * Who/What/When tracker (no weekly sub-rows, no comments) so the CREATE card is
 * a plain field list and there's no comment composer. Status edits surface a
 * distinct STATUS pill (per the design), like Priority.
 */
export const wwwAuditConfig: AuditEntityConfig<WWWAuditEntity> = {
  entityType: "WWW",
  badgeLabel: "WWW",
  badgeColor: PILLAR_TOKENS.execution,
  dialogLabel: "WWW change history",
  exportPrefix: "www",
  fieldLabel: wwwFieldLabel,
  periodLabel: (w) => `Due ${fmtDate(w.when)}`,
  weeklyKind: "status",
  operationFor: (action) => (action === "STATUS_CHANGE" ? "STATUS" : undefined),
  useTimeline: (id) => useEntityAuditTimeline("WWW", id),
  useMarkRead: () => useEntityMarkRead("WWW"),
  useWeekLabels: () => [], // WWW has no fiscal-week breakdown
  statusDot: (w) => ({
    className: statusDotColor(w.status),
    label: `Status indicator: ${statusLabel(w.status)}`,
  }),
  renderCreateCard: ({ entity, open, onToggle }) => (
    <WWWCreateCard item={entity} open={open} onToggle={onToggle} />
  ),
};

function WWWCreateCard({
  item,
  open,
  onToggle,
}: {
  item: WWWAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const whoUser = item.who_user;
  const whoDisplay =
    (whoUser ? `${whoUser.firstName} ${whoUser.lastName}`.trim() : "") ||
    (typeof item.who === "string" ? item.who : null);

  const fields: [string, unknown][] = [
    ["What", item.what],
    ["Who", whoDisplay],
    ["When", fmtDate(item.when)],
    ["Status", item.status ? statusLabel(item.status) : null],
    ["Category", item.category],
    ["Original Due Date", item.originalDueDate ? fmtDate(item.originalDueDate) : null],
    ["Notes", item.notes],
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
                <span className="w-36 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
