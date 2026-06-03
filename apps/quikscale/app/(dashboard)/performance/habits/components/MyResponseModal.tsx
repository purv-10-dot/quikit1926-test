"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, Lock, X } from "lucide-react";
import { useSubmitMyResponse } from "@/lib/hooks/useHabits";
import {
  HABIT_KEYS,
  HABIT_DEFINITIONS,
  type HabitKey,
  type SubItemBits,
} from "@/lib/schemas/habitSchema";

const EMPTY_BITS: SubItemBits = Object.fromEntries(
  HABIT_KEYS.map((k) => [k, [false, false, false, false]]),
) as SubItemBits;

export function MyResponseModal({
  campaignId,
  campaignLabel,
  onClose,
  onSubmitted,
}: {
  campaignId: string;
  campaignLabel: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const submit = useSubmitMyResponse(campaignId);
  const [bits, setBits] = useState<SubItemBits>(EMPTY_BITS);
  const [expanded, setExpanded] = useState<HabitKey | null>(HABIT_KEYS[0]);
  const [error, setError] = useState<string | null>(null);

  const totalChecked = useMemo(
    () => HABIT_KEYS.reduce((s, k) => s + bits[k].filter(Boolean).length, 0),
    [bits],
  );
  const progressPct = Math.round((totalChecked / 40) * 100);

  function toggle(key: HabitKey, idx: number) {
    setBits((prev) => {
      const row = [...prev[key]] as [boolean, boolean, boolean, boolean];
      row[idx] = !row[idx];
      return { ...prev, [key]: row };
    });
  }

  async function handleSubmit() {
    setError(null);
    try {
      await submit.mutateAsync({ subItemBits: bits });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[94vh] sm:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
              Fill your response · {campaignLabel}
            </h2>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed flex items-center gap-1">
              <Lock className="h-3 w-3 inline" />
              Private &amp; final — counted in the aggregate, not visible to others.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-4 space-y-2 bg-gray-50/40">
          {HABIT_KEYS.map((key, idx) => {
            const def = HABIT_DEFINITIONS[key];
            const row = bits[key];
            const checked = row.filter(Boolean).length;
            const isOpen = expanded === key;
            return (
              <div
                key={key}
                className={`bg-white border rounded-xl overflow-hidden transition-colors ${
                  checked > 0 ? "border-accent-200" : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-gray-50/70 transition-colors"
                >
                  <span className="text-[10px] font-bold text-gray-400 w-6 tabular-nums flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-gray-900 min-w-0">
                    {def.label}
                  </span>
                  <span
                    className={`text-[10px] font-semibold tabular-nums flex-shrink-0 px-2 py-0.5 rounded-full ${
                      checked === 4
                        ? "bg-green-50 text-green-700"
                        : checked > 0
                          ? "bg-accent-50 text-accent-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {checked}/4
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-3 space-y-1">
                    {def.subItems.map((item, i) => {
                      const isChecked = row[i];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggle(key, i)}
                          className={`w-full flex items-start gap-3 text-left p-2 rounded-lg transition-colors ${
                            isChecked ? "bg-white" : "hover:bg-white"
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-5 w-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                              isChecked
                                ? "bg-accent-600 border-accent-600"
                                : "bg-white border-gray-300"
                            }`}
                          >
                            {isChecked && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3 text-white">
                                <path
                                  d="M2.5 6.5 L5 9 L9.5 3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums text-gray-400 w-8 mt-1 flex-shrink-0">
                            {idx + 1}.{i + 1}
                          </span>
                          <span
                            className={`text-[12px] sm:text-[13px] leading-relaxed select-none ${
                              isChecked ? "text-gray-900" : "text-gray-600"
                            }`}
                          >
                            {item}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 bg-white flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-accent-500 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
              {totalChecked}/40
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submit.isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submit.isPending ? "Submitting…" : "Submit response"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
