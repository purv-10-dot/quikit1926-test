"use client";

import { useMemo, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { useCreateHabitCampaign } from "@/lib/hooks/useHabits";
import { getFiscalQuarter, getFiscalYear } from "@/lib/utils/fiscal";
import type { AdminCampaignRow } from "./types";

const QUARTERS: Array<{ key: "Q1" | "Q2" | "Q3" | "Q4"; range: string }> = [
  { key: "Q1", range: "Jan – Mar" },
  { key: "Q2", range: "Apr – Jun" },
  { key: "Q3", range: "Jul – Sep" },
  { key: "Q4", range: "Oct – Dec" },
];

interface Props {
  onClose: () => void;
  onCreated?: (id: string) => void;
  existingRows?: AdminCampaignRow[];
}

export function LaunchAssessmentModal({ onClose, onCreated, existingRows = [] }: Props) {
  const currentQuarter = getFiscalQuarter();
  const currentYear = getFiscalYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  const [quarter, setQuarter] = useState<string>(currentQuarter);
  const [year, setYear] = useState<number>(currentYear);
  const [deadline, setDeadline] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateHabitCampaign();

  // Per-quarter context shown beneath each quarter card: "1 round done",
  // "Active campaign", "Not started" — helps admin see at a glance whether
  // they're about to start a fresh round or open the first.
  const quarterStatus = useMemo(() => {
    const map: Record<string, { closed: number; open: number }> = {};
    for (const r of existingRows) {
      if (r.isLegacy || r.year !== year) continue;
      const entry = (map[r.quarter] ??= { closed: 0, open: 0 });
      if (r.status === "closed") entry.closed += 1;
      else entry.open += 1;
    }
    return map;
  }, [existingRows, year]);

  async function handleSave() {
    setError(null);
    try {
      const result = (await create.mutateAsync({
        quarter,
        year,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        notes: notes || null,
      })) as { id: string };
      onCreated?.(result.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">
              New Habits Assessment
            </h2>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Create a draft. Launch it (make it visible to members) any time after.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2.5">
              Quarter
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUARTERS.map((q) => {
                const stat = quarterStatus[q.key];
                const isSelected = quarter === q.key;
                return (
                  <button
                    key={q.key}
                    onClick={() => setQuarter(q.key)}
                    className={`relative text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? "border-accent-500 ring-1 ring-accent-200 bg-accent-50/40 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="absolute top-2 right-2">
                      <RadioDot selected={isSelected} />
                    </div>
                    <div
                      className={`text-base font-bold tracking-tight ${
                        isSelected ? "text-accent-700" : "text-gray-900"
                      }`}
                    >
                      {q.key}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{q.range}</div>
                    <div className="mt-2 flex items-center gap-1 text-[10px]">
                      <QuarterStatusDot status={stat} />
                      <span className="text-gray-500">{quarterStatusLabel(stat)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400 tabular-nums"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Deadline <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Notes for members <span className="text-gray-400 normal-case">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Please fill before Tuesday's leadership meeting."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={create.isPending}
            className="px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
        selected ? "border-accent-600" : "border-gray-300"
      }`}
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent-600" />}
    </span>
  );
}

function QuarterStatusDot({ status }: { status?: { closed: number; open: number } }) {
  if (!status) return <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />;
  if (status.open > 0) return <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />;
}

function quarterStatusLabel(status?: { closed: number; open: number }): string {
  if (!status) return "Not started";
  if (status.open > 0) return status.open === 1 ? "Open campaign" : `${status.open} open`;
  return status.closed === 1 ? "1 round done" : `${status.closed} rounds done`;
}
