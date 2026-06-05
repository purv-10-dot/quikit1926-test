"use client";

import {
  CheckCircle2,
  Circle,
  Edit2,
  Trash2,
  Zap,
} from "lucide-react";
import type { NotificationRule } from "@/lib/notifications/rules/types";
import {
  CONDITION_LABELS,
  ENTITY_RECIPIENT_LABELS,
} from "@/lib/notifications/rules/types";

const ENTITY_COLORS: Record<string, string> = {
  lead:        "bg-blue-100 text-blue-700",
  task:        "bg-violet-100 text-violet-700",
  opportunity: "bg-emerald-100 text-emerald-700",
  quote:       "bg-amber-100 text-amber-700",
  contact:     "bg-rose-100 text-rose-700",
};

interface Props {
  rule: NotificationRule;
  onEdit: (rule: NotificationRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  isTogglingId: string | null;
  isDeletingId: string | null;
}

export function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
  isTogglingId,
  isDeletingId,
}: Props) {
  const entityColor = ENTITY_COLORS[rule.entityType] ?? "bg-slate-100 text-slate-600";
  const condLabel = CONDITION_LABELS[rule.conditionType] ?? rule.conditionType;
  const recipLabel =
    ENTITY_RECIPIENT_LABELS[rule.entityType]?.[rule.recipientType] ?? rule.recipientType;

  const conditionSummary = buildConditionSummary(rule);

  return (
    <div
      className={[
        "group flex flex-col gap-3 rounded-xl border p-4 transition-colors",
        rule.isActive
          ? "border-crm-border bg-white hover:border-slate-300"
          : "border-dashed border-slate-200 bg-slate-50/60",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${entityColor}`}
          >
            <Zap size={14} strokeWidth={2.5} />
          </div>

          {/* Name + condition */}
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold leading-tight ${rule.isActive ? "text-slate-900" : "text-slate-400"}`}
            >
              {rule.name}
            </p>
            {rule.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                {rule.description}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Edit rule"
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(rule.id)}
            disabled={isDeletingId === rule.id}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            aria-label="Delete rule"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Condition summary ── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          When
        </p>
        <p className="mt-1 text-xs text-slate-700">{conditionSummary}</p>
      </div>

      {/* ── Recipient + channels ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${entityColor}`}>
          {rule.entityType.charAt(0).toUpperCase() + rule.entityType.slice(1)}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          → {recipLabel}
          {rule.recipientType === "specific_user" && rule.recipientValue
            ? ` (${rule.recipientValue.slice(0, 8)}…)`
            : ""}
          {rule.recipientType === "specific_role" && rule.recipientValue
            ? ` · ${rule.recipientValue}`
            : ""}
        </span>

        {rule.notifyInApp && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            In-App
          </span>
        )}
        {rule.notifyEmail && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
            Email
          </span>
        )}

        {/* Active toggle */}
        <button
          type="button"
          onClick={() => onToggle(rule.id, !rule.isActive)}
          disabled={isTogglingId === rule.id}
          className={[
            "ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
            "text-[11px] font-semibold transition-colors",
            "disabled:pointer-events-none disabled:opacity-50",
            rule.isActive
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200",
          ].join(" ")}
          aria-label={rule.isActive ? "Deactivate rule" : "Activate rule"}
        >
          {rule.isActive ? (
            <CheckCircle2 size={11} strokeWidth={2.5} />
          ) : (
            <Circle size={11} strokeWidth={2} />
          )}
          {rule.isActive ? "Active" : "Inactive"}
        </button>
      </div>

      {/* ── Message preview ── */}
      <p className="truncate rounded border border-dashed border-slate-200 px-2.5 py-1.5 font-mono text-[11px] text-slate-500">
        {rule.messageTemplate}
      </p>
    </div>
  );
}

// ─── Condition summary builder ────────────────────────────────────────────────

function buildConditionSummary(rule: NotificationRule): string {
  const entity = rule.entityType.charAt(0).toUpperCase() + rule.entityType.slice(1);
  const condLabel = CONDITION_LABELS[rule.conditionType] ?? rule.conditionType;

  switch (rule.conditionType) {
    case "entity_created":
      return `${entity} is created`;
    case "entity_updated":
      return `${entity} is updated`;
    case "entity_deleted":
      return `${entity} is deleted`;
    case "field_changed":
      return `${entity} › ${rule.fieldName ?? "?"} changes (any value)`;
    case "field_equals":
      return `${entity} › ${rule.fieldName ?? "?"} = "${rule.conditionValue ?? ""}"`;
    case "field_not_equals":
      return `${entity} › ${rule.fieldName ?? "?"} ≠ "${rule.conditionValue ?? ""}"`;
    case "field_contains":
      return `${entity} › ${rule.fieldName ?? "?"} contains "${rule.conditionValue ?? ""}"`;
    case "field_greater_than":
      return `${entity} › ${rule.fieldName ?? "?"} > ${rule.conditionValue ?? "?"}`;
    case "field_less_than":
      return `${entity} › ${rule.fieldName ?? "?"} < ${rule.conditionValue ?? "?"}`;
    default:
      return `${entity} ${condLabel}`;
  }
}
