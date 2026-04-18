"use client";

import { useState } from "react";
import { useUpdatePriority, useUpdateWeeklyStatus } from "@/lib/hooks/usePriority";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PriorityRow } from "@/lib/types/priority";
import { fiscalYearLabel, ALL_QUARTERS, getFiscalYear, weekDateLabel, getWeekDateRange } from "@/lib/utils/fiscal";
import { STATUS_META, STATUS_PILL_OPTIONS, STATUS_SELECT_OPTIONS } from "@/lib/constants/status";
import { UserPicker } from "@quikit/ui";

interface Props {
  priority: PriorityRow;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = getFiscalYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);
const WEEK_OPTIONS = Array.from({ length: 13 }, (_, i) => i + 1);

const OVERALL_STATUS_OPTIONS = STATUS_SELECT_OPTIONS;

export function PriorityLogModal({ priority, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<"edit" | "weekly" | "notes">("edit");

  // Edit tab state
  const [form, setForm] = useState({
    name: priority.name,
    description: priority.description ?? "",
    owner: priority.owner,
    teamId: priority.teamId ?? "",
    quarter: priority.quarter,
    year: String(priority.year),
    startWeek: String(priority.startWeek ?? 1),
    endWeek: String(priority.endWeek ?? 13),
    overallStatus: priority.overallStatus,
  });

  // Notes tab state
  const [notes, setNotes] = useState(priority.notes ?? "");

  // Weekly status local state (week -> { status, notes })
  const [weeklyData, setWeeklyData] = useState<Record<number, { status: string; notes: string }>>(() => {
    const map: Record<number, { status: string; notes: string }> = {};
    priority.weeklyStatuses.forEach(ws => {
      map[ws.weekNumber] = { status: ws.status, notes: ws.notes ?? "" };
    });
    return map;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: users = [] } = useUsers();
  const { data: teams = [] } = useTeams();
  const updatePriority = useUpdatePriority(priority.id);
  const updateWeeklyStatus = useUpdateWeeklyStatus(priority.id);

  function setField(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.owner) errs.owner = "Owner is required";
    const sw = parseInt(form.startWeek);
    const ew = parseInt(form.endWeek);
    if (sw && ew && sw > ew) errs.endWeek = "End week must be >= start week";
    return errs;
  }

  async function handleSave() {
    if (tab === "weekly") return; // auto-saves
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await updatePriority.mutateAsync({
        name: form.name.trim(),
        description: form.description || undefined,
        startWeek: parseInt(form.startWeek),
        endWeek: parseInt(form.endWeek),
        overallStatus: form.overallStatus,
        notes: tab === "notes" ? notes : undefined,
      } as any);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setErrors({ _: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleWeeklyStatusChange(weekNumber: number, status: string) {
    setWeeklyData(prev => ({ ...prev, [weekNumber]: { ...prev[weekNumber], status } }));
    try {
      await updateWeeklyStatus.mutateAsync({ weekNumber, status, notes: weeklyData[weekNumber]?.notes });
    } catch {
      // revert on error
      setWeeklyData(prev => ({ ...prev, [weekNumber]: { ...prev[weekNumber], status: priority.weeklyStatuses.find(ws => ws.weekNumber === weekNumber)?.status ?? "" } }));
    }
  }

  async function handleWeeklyNotesBlur(weekNumber: number) {
    const current = weeklyData[weekNumber];
    if (!current) return;
    try {
      await updateWeeklyStatus.mutateAsync({ weekNumber, status: current.status, notes: current.notes });
    } catch {
      // ignore
    }
  }

  const startWeek = parseInt(form.startWeek) || 1;
  const endWeek = parseInt(form.endWeek) || 13;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 truncate max-w-[420px]">{priority.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {fiscalYearLabel(priority.year)} · {priority.quarter}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
          {(["edit", "weekly", "notes"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {t === "weekly" ? "Weekly Status" : t === "edit" ? "Edit" : "Notes"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 mb-4">
              {errors._}
            </div>
          )}

          {/* ── Edit Tab ── */}
          {tab === "edit" && (
            <div className="space-y-4">
              {/* Row 1: Priority Name (full width) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Priority Name <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => setField("name", e.target.value)}
                  className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
                {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
              </div>

              {/* Row 2: Team (read-only) | Owner (read-only) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Team</label>
                  <select value={form.teamId} disabled
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed">
                    <option value="">No team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Owner <span className="text-red-500">*</span>
                  </label>
                  <UserPicker value={form.owner} onChange={() => {}} users={users} error={false} disabled />
                </div>
              </div>

              {/* Row 3: Quarter (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
                <div className="grid grid-cols-2 gap-2 max-w-[50%]">
                  <select value={form.year} disabled
                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed">
                    {FISCAL_YEARS.map(y => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
                  </select>
                  <select value={form.quarter} disabled
                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed">
                    {ALL_QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 4: Start Week | End Week */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Week</label>
                  <select value={form.startWeek} onChange={e => setField("startWeek", e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    {WEEK_OPTIONS.map(w => (
                      <option key={w} value={w}>Week {w}  ({getWeekDateRange(parseInt(form.year), form.quarter, w)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Week</label>
                  <select value={form.endWeek} onChange={e => setField("endWeek", e.target.value)}
                    className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white ${errors.endWeek ? "border-red-400" : "border-gray-200"}`}>
                    {WEEK_OPTIONS.map(w => (
                      <option key={w} value={w}>Week {w}  ({getWeekDateRange(parseInt(form.year), form.quarter, w)})</option>
                    ))}
                  </select>
                  {errors.endWeek && <p className="text-[10px] text-red-500 mt-0.5">{errors.endWeek}</p>}
                </div>
              </div>

              {/* Overall Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Overall Status</label>
                <select value={form.overallStatus} onChange={e => setField("overallStatus", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                  {OVERALL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setField("description", e.target.value)}
                  rows={3} placeholder="Enter description…"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
              </div>
            </div>
          )}

          {/* ── Weekly Status Tab ── */}
          {tab === "weekly" && (
            <div className="space-y-3">
              <p className="text-[11px] text-gray-400">
                Showing weeks {startWeek} – {endWeek}. Status saves automatically.
              </p>
              {Array.from({ length: endWeek - startWeek + 1 }, (_, i) => startWeek + i).map(weekNum => {
                const data = weeklyData[weekNum] ?? { status: "", notes: "" };
                return (
                  <div key={weekNum} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-gray-700">Week {weekNum}</span>
                        <span className="text-[10px] text-gray-400 ml-2">
                          {weekDateLabel(priority.year, priority.quarter, weekNum)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {STATUS_PILL_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => handleWeeklyStatusChange(weekNum, opt.value)}
                            className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${data.status === opt.value ? opt.selectedClass : opt.baseClass}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={data.notes}
                      onChange={e => setWeeklyData(prev => ({ ...prev, [weekNum]: { ...prev[weekNum], status: prev[weekNum]?.status ?? "", notes: e.target.value } }))}
                      onBlur={() => handleWeeklyNotesBlur(weekNum)}
                      placeholder="Notes for this week…"
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none text-gray-600 placeholder-gray-300"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Notes Tab ── */}
          {tab === "notes" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Overall Priority Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={10} placeholder="Enter notes about this priority…"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Cancel
          </button>
          {tab !== "weekly" && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Save Changes
            </button>
          )}
          {tab === "weekly" && (
            <span className="text-[10px] text-gray-400 italic">Changes save automatically</span>
          )}
        </div>
      </div>
    </div>
  );
}
