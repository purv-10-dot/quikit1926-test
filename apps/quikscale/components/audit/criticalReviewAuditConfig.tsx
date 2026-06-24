"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";
import { useCriticalReviewTimeline } from "@/lib/hooks/useCriticalReviewAudit";
import { criticalFieldLabel } from "@/lib/audit/criticalFields";
import { CRIT_BULLET_COLORS, CRIT_BULLET_LABELS } from "@/app/(dashboard)/opsp/review/helpers";
import { toNum } from "@/lib/utils/opspHelpers";

/**
 * Entity passed to the generic Change History panel for a Critical # /
 * Balancing Critical # card. Carries the card spec + saved review entry so the
 * CREATE card can render the projected tiers, Achieved, and Comment.
 */
export interface CriticalAuditEntity {
  /** Composite entityId: `${opspId}:${period}`. */
  id: string;
  /** Card title (or the card-type label when the title is blank). */
  name: string;
  /** "Individual · Critical #" style scope chip. */
  scopeLabel: string;
  card: { title: string; bullets: string[] };
  entry: { achievedValue: number | null; comment: string | null } | null;
}

// Stable no-op read-mark. The Critical clock icon shows no unread badge, so we
// don't write a read marker (and avoid coupling to the KPI-module-gated
// /api/audit/mark-read endpoint, which a critical-only reviewer may not reach).
// A module-level constant keeps the reference stable across renders so the
// panel's mark-read effect doesn't re-fire every render.
const NOOP_MARK_READ = { mutate: () => {} };

/**
 * Critical # Review config for the shared `EntityChangeHistoryPanel` — the same
 * rich timeline (tabs, operation pills, field-level diffs, export) used by KPI,
 * Priority, and WWW. No weekly kind (criticals have a single Achieved +
 * Comment), and a CREATE card showing the projected tiers + Achieved + Comment.
 */
export const criticalReviewAuditConfig: AuditEntityConfig<CriticalAuditEntity> = {
  entityType: "CRITICAL_REVIEW",
  badgeLabel: "CRITICAL",
  badgeColor: PILLAR_TOKENS.alignment,
  dialogLabel: "Critical # change history",
  exportPrefix: "critical-review",
  fieldLabel: criticalFieldLabel,
  periodLabel: (e) => e.scopeLabel,
  useTimeline: (id) => useCriticalReviewTimeline(id),
  useMarkRead: () => NOOP_MARK_READ,
  useWeekLabels: () => [],
  renderCreateCard: ({ entity, open, onToggle }) => (
    <CriticalCreateCard entity={entity} open={open} onToggle={onToggle} />
  ),
};

function CriticalCreateCard({
  entity,
  open,
  onToggle,
}: {
  entity: CriticalAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const { card, entry } = entity;
  const achieved = entry?.achievedValue ?? null;

  const fields: [string, unknown][] = [
    ["Title", card.title],
    ["Achieved", achieved],
    ["Comment", entry?.comment ?? null],
  ];

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="mb-1 flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700"
      >
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

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">
              Projected Tiers
            </p>
            <div className="mt-1 space-y-1">
              {[0, 1, 2, 3].map((i) => {
                const raw = card.bullets[i] ?? "";
                const num = toNum(raw);
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: CRIT_BULLET_COLORS[i] }}
                    />
                    <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      {CRIT_BULLET_LABELS[i]}
                    </span>
                    <span className="font-medium tabular-nums text-gray-900">
                      {raw.trim() === "" ? "—" : num !== null ? num.toLocaleString() : raw}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
