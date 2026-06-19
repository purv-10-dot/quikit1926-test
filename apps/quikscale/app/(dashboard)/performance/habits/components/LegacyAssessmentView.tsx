"use client";

import { useState } from "react";
import { CheckSquare, ChevronDown, Square, Trash2 } from "lucide-react";
import { useDeleteHabitCampaign } from "@/lib/hooks/useHabits";
import { useConfirm } from "@quikit/ui";
import {
  HABIT_KEYS,
  HABIT_DEFINITIONS,
  MATURITY_LEVELS,
  calcTotal,
  getMaturityLevel,
  type HabitKey,
} from "@/lib/schemas/habitSchema";
import type { AdminCampaignRow } from "./types";

/**
 * Read-only renderer for pre-rebuild single-user assessments.
 * Preserves the original AssessmentDetail layout so historical 2025/early-2026
 * data still tells the same story when the admin clicks into it.
 */
export function LegacyAssessmentView({
  campaign,
  onDeleted,
}: {
  campaign: AdminCampaignRow;
  onDeleted?: () => void;
}) {
  const remove = useDeleteHabitCampaign();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<Set<HabitKey>>(new Set());

  const scores = Object.fromEntries(
    HABIT_KEYS.map((k) => [k, campaign[k] ?? 0]),
  ) as Record<HabitKey, number>;
  const total = calcTotal(scores);
  const maturity = getMaturityLevel(total);
  const pct = Math.round((total / 40) * 100);

  function toggle(k: HabitKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleDelete() {
    if (
      !(await confirm({
        title: `Delete ${campaign.quarter} ${campaign.year} (legacy)?`,
        description: "This historical assessment will be removed.",
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    await remove.mutateAsync(campaign.id);
    onDeleted?.();
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              {campaign.quarter} {campaign.year} Assessment
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="inline-block px-1.5 py-0.5 rounded-full font-semibold mr-2 bg-gray-100 text-gray-600">
                legacy · single-user
              </span>
              {new Date(campaign.assessmentDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${maturity.bg} ${maturity.text}`}
            >
              {maturity.label}
            </span>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md hover:bg-red-50 text-red-400"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Overall</span>
            <span>
              {total}/40 · {pct}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${maturity.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-400 pt-0.5">
            {MATURITY_LEVELS.map((m) => (
              <span
                key={m.label}
                className={total >= m.min && total <= m.max ? `font-semibold ${m.text}` : ""}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {HABIT_KEYS.map((key, idx) => {
          const def = HABIT_DEFINITIONS[key];
          const score = scores[key];
          const isExpanded = expanded.has(key);
          const habitPct = Math.round((score / 4) * 100);
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className="text-[10px] font-bold text-gray-400 w-5">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{def.label}</div>
                  <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        score === 4
                          ? "bg-green-400"
                          : score >= 2
                            ? "bg-amber-400"
                            : score > 0
                              ? "bg-red-400"
                              : "bg-gray-200"
                      }`}
                      style={{ width: `${habitPct}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    score === 4
                      ? "bg-green-100 text-green-700"
                      : score >= 2
                        ? "bg-amber-100 text-amber-700"
                        : score > 0
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {score}/4
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                  {def.subItems.map((item, i) => {
                    const checked = i < score;
                    return (
                      <div key={i} className="flex items-start gap-2">
                        {checked ? (
                          <CheckSquare className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Square className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-xs leading-relaxed ${checked ? "text-gray-700" : "text-gray-400"}`}
                        >
                          {item}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {campaign.notes && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Notes
          </p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{campaign.notes}</p>
        </div>
      )}
    </div>
  );
}
