"use client";

import { useState } from "react";
import { useUpdatePriority, useUpdateWeeklyStatusesBatch } from "@/lib/hooks/usePriority";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PriorityRow } from "@/lib/types/priority";
import { fiscalYearLabel, ALL_QUARTERS, getFiscalYear, weekDateLabel, getWeekDateRange, weeksArray } from "@/lib/utils/fiscal";
import { STATUS_META, STATUS_PILL_OPTIONS } from "@/lib/constants/status";
import { UserPicker } from "@quikit/ui";
import { useCurrentWeek, useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { usePastWeekFlags, useCustomQuarterSettings, useWeeklyMeetingDay } from "@/lib/hooks/useFeatureFlags";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";

interface Props {
  priority: PriorityRow;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * When true, the panel shows ONLY the weekly-status log (read-only).
   * No Edit or Notes tabs, no tab bar, no Save button. Triggered by the
   * log-icon click in the Priority table.
   */
  logsOnly?: boolean;
  /** RBAC v2 — false makes the drawer fully read-only (every input disabled,
   *  Save Changes hidden). Defaults to true. */
  canUpdate?: boolean;
}

const CURRENT_YEAR = getFiscalYear();

export function PriorityLogModal({ priority, onClose, onSuccess, logsOnly = false, canUpdate = true }: Props) {
  // logsOnly mode forces the weekly-log view and locks everything read-only,
  // regardless of edit permission.
  const [tab, setTab] = useState<"edit" | "weekly" | "notes">(logsOnly ? "weekly" : "edit");

  // Legacy instance-level edit gate (creator / assignee / legacy admin)
  // removed per product spec — anyone with RBAC v2 `Priority:update` can
  // edit any priority. Row-level visibility (visibility.ts) restricts
  // non-admins to their own rows in the list, so they only ever see their
  // own to edit. The drawer is read-only only in logsOnly mode (icon-only
  // view) or when the role doesn't grant `update`.
  const readOnly = logsOnly || !canUpdate;

  // Past/future-week locks — same pattern as KPI. Past respects the
  // `canEditPastWeek` feature flag (admin opt-in); future is always disabled
  // so users can't pre-fill statuses ahead of time.
  const { canEditPastWeek } = usePastWeekFlags();
  const priorityCurrentWeek = useCurrentWeek(priority.year, priority.quarter);
  const priorityWeekLabels = useWeekLabels(priority.year, priority.quarter);

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
  });

  // DB-scoped fiscal years via shared hook
  const { years: fyYears } = useFiscalYears();
  const yearOptions = fyYears.length ? fyYears : [CURRENT_YEAR];
  const { getStartDate: getQuarterStartDate, getEndDate: getQuarterEndDate, getWeekCount } = useQuarterStartDates();
  // Weeks in this priority's quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = getWeekCount(priority.year, priority.quarter);
  // Custom Quarter Settings: meeting-day week alignment + quarter-end clamp.
  // Null meeting day (toggle off) → legacy calendar weeks, unchanged.
  const customQuarterOn = useCustomQuarterSettings();
  const rawMeetingDay = useWeeklyMeetingDay();
  const effectiveMeetingDay = customQuarterOn ? rawMeetingDay : null;
  const weekRangeHint = (y: number, q: string, w: number) =>
    getWeekDateRange(y, q, w, getQuarterStartDate(y, q), effectiveMeetingDay, getQuarterEndDate(y, q));
  const weekOptions = weeksArray(weekCount);

  // Notes tab state
  const [notes, setNotes] = useState(priority.notes ?? "");

  // Weekly status local state (week -> { status, notes }).
  // Weekly edits are BUFFERED locally and only persisted when the user clicks
  // "Save Weekly changes" — no per-click autosave. We keep a clean baseline
  // (`baseline`) to diff against so Save sends only the weeks that actually
  // changed, and re-baseline after a successful save.
  const buildWeeklyMap = () => {
    const map: Record<number, { status: string; notes: string }> = {};
    priority.weeklyStatuses.forEach(ws => {
      map[ws.weekNumber] = { status: ws.status, notes: ws.notes ?? "" };
    });
    return map;
  };
  const [weeklyData, setWeeklyData] = useState<Record<number, { status: string; notes: string }>>(buildWeeklyMap);
  // Clean baseline (last-saved state). Re-snapshotted from the current buffer
  // after each successful save so the Save button disables until the next edit.
  const [baseline, setBaseline] = useState<Record<number, { status: string; notes: string }>>(buildWeeklyMap);
  // Brief "Saved ✓" confirmation flash in the footer.
  const [savedFlash, setSavedFlash] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Note normalization must match the batch route (normNotes): "" and null
  // are equivalent, so a blank vs. absent note is NOT a change.
  const normNotes = (s: string | null | undefined) => (s == null || s === "" ? null : s);

  // Weeks whose status or notes differ from the last-saved baseline — drives
  // both the Save button's enabled state and the payload it sends.
  function getDirtyWrites(): Array<{ weekNumber: number; status: string; notes: string }> {
    const writes: Array<{ weekNumber: number; status: string; notes: string }> = [];
    for (const [wStr, val] of Object.entries(weeklyData)) {
      const week = parseInt(wStr, 10);
      const base = baseline[week] ?? { status: "", notes: "" };
      const changed = base.status !== val.status || normNotes(base.notes) !== normNotes(val.notes);
      if (changed) writes.push({ weekNumber: week, status: val.status, notes: val.notes });
    }
    return writes.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  const { data: users = [] } = useUsers();
  const { data: teams = [] } = useTeams();
  const updatePriority = useUpdatePriority(priority.id);
  const updateWeeklyStatusesBatch = useUpdateWeeklyStatusesBatch(priority.id);

  // Unsaved-changes guard for Cancel / backdrop click. Weekly edits are
  // buffered now, so closing with dirty weeks would silently lose them.
  function requestClose() {
    if (getDirtyWrites().length > 0 && !window.confirm("Discard unsaved weekly changes?")) {
      return;
    }
    onClose();
  }

  function setField(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  // Start Week change auto-bumps End Week if it would become invalid (< startWeek).
  // Keeps the End Week dropdown selection in sync with its filtered options.
  function handleStartWeekChange(val: string) {
    setForm(f => {
      const sw = parseInt(val);
      const ew = parseInt(f.endWeek);
      const nextEnd = !isNaN(sw) && !isNaN(ew) && ew < sw ? val : f.endWeek;
      return { ...f, startWeek: val, endWeek: nextEnd };
    });
    setErrors(e => { const n = { ...e }; delete n.startWeek; delete n.endWeek; return n; });
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
    if (tab === "weekly") return; // weekly tab uses handleSaveWeekly
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await updatePriority.mutateAsync({
        name: form.name.trim(),
        description: form.description || undefined,
        startWeek: parseInt(form.startWeek),
        endWeek: parseInt(form.endWeek),
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

  // Status-pill click — BUFFERS the change locally; nothing is persisted until
  // the user clicks "Save Weekly changes". When the user marks a week as
  // "completed", cascade Completed forward to every subsequent week up to the
  // end of the quarter (week 13); existing notes on cascaded weeks are
  // preserved. If the priority's endWeek is shorter, the grid auto-extends to
  // 13 locally so the cascaded weeks are visible — the extend is committed to
  // the priority on Save (handleSaveWeekly).
  function handleWeeklyStatusChange(weekNumber: number, status: string) {
    const QUARTER_END = weekCount;
    const currentEnd = parseInt(form.endWeek) || QUARTER_END;
    const cascadeUpper = status === "completed" ? QUARTER_END : currentEnd;

    const writes: Array<{ weekNumber: number; status: string; notes: string }> = [
      { weekNumber, status, notes: weeklyData[weekNumber]?.notes ?? "" },
    ];
    if (status === "completed") {
      for (let w = weekNumber + 1; w <= cascadeUpper; w++) {
        if (weeklyData[w]?.status === "completed") continue;
        writes.push({ weekNumber: w, status: "completed", notes: weeklyData[w]?.notes ?? "" });
      }
    }

    setWeeklyData(prev => {
      const next = { ...prev };
      for (const wr of writes) next[wr.weekNumber] = { status: wr.status, notes: wr.notes };
      return next;
    });
    if (status === "completed" && currentEnd < QUARTER_END) {
      setForm(f => ({ ...f, endWeek: String(QUARTER_END) }));
    }
    setSavedFlash(false);
  }

  // Persist all buffered weekly edits in ONE batch request. The server groups
  // ≥3 changed weeks into a single "Bulk weekly update" card; 1–2 changed weeks
  // become individual WEEKLY_UPDATE entries. An auto-extended endWeek (from a
  // Completed cascade) is committed alongside in the same save.
  async function handleSaveWeekly() {
    const writes = getDirtyWrites();
    const QUARTER_END = weekCount;
    const originalEnd = priority.endWeek ?? QUARTER_END;
    const nextEnd = parseInt(form.endWeek) || QUARTER_END;
    const shouldExtendEndWeek = nextEnd > originalEnd;
    if (!writes.length && !shouldExtendEndWeek) return;

    setSaving(true);
    setErrors({});
    try {
      await Promise.all([
        ...(writes.length ? [updateWeeklyStatusesBatch.mutateAsync(writes)] : []),
        ...(shouldExtendEndWeek
          ? [updatePriority.mutateAsync({ endWeek: nextEnd } as any)]
          : []),
      ]);
      // Re-baseline to the just-saved buffer so the Save button disables until
      // the next edit (the dirty diff is now empty).
      setBaseline({ ...weeklyData });
      setSavedFlash(true);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save weekly changes";
      setErrors({ _: msg });
    } finally {
      setSaving(false);
    }
  }

  const startWeek = parseInt(form.startWeek) || 1;
  const endWeek = parseInt(form.endWeek) || 13;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={requestClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 truncate max-w-[420px]">{priority.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {fiscalYearLabel(priority.year)} · {priority.quarter}
            </p>
          </div>
          <button onClick={requestClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs (hidden in logsOnly mode — log icon opens weekly log directly) */}
        {!logsOnly && (
          <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
            {(["edit", "weekly", "notes"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {t === "weekly" ? "Weekly Status" : t === "edit" ? "Edit" : "Notes"}
              </button>
            ))}
          </div>
        )}

        {/* Body. `<fieldset disabled>` natively disables every input, select,
            textarea and button inside when RBAC denies `update`. */}
        <fieldset disabled={!canUpdate} className={`flex-1 overflow-y-auto px-6 py-5 ${!canUpdate ? "opacity-70" : ""}`}>
          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 mb-4">
              {errors._}
            </div>
          )}
          {!canUpdate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
              Read-only — your role doesn&apos;t grant update access on this priority.
            </div>
          )}

          {/* ── Edit Tab ── */}
          {tab === "edit" && (
            <div className="space-y-4">
              {/* Legacy instance-level banner removed per product spec.
                  The RBAC v2 banner above (when !canUpdate) covers the only
                  remaining read-only case. */}
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
                <div className="grid grid-cols-2 gap-4">
                  <select value={form.year} disabled
                    className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed">
                    {yearOptions.map(y => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
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
                  <select value={form.startWeek} onChange={e => handleStartWeekChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    {weekOptions.map(w => (
                      <option key={w} value={w}>Week {w}  ({weekRangeHint(parseInt(form.year), form.quarter, w)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Week</label>
                  <select value={form.endWeek} onChange={e => setField("endWeek", e.target.value)}
                    className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white ${errors.endWeek ? "border-red-400" : "border-gray-200"}`}>
                    {weekOptions.filter(w => w >= (parseInt(form.startWeek) || 1)).map(w => (
                      <option key={w} value={w}>Week {w}  ({weekRangeHint(parseInt(form.year), form.quarter, w)})</option>
                    ))}
                  </select>
                  {errors.endWeek && <p className="text-[10px] text-red-500 mt-0.5">{errors.endWeek}</p>}
                </div>
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
                {logsOnly
                  ? `Weekly status log for weeks ${startWeek} – ${endWeek} (read-only).`
                  : `Showing weeks ${startWeek} – ${endWeek}. Update statuses & notes, then click Save Weekly changes.`}
              </p>
              {Array.from({ length: endWeek - startWeek + 1 }, (_, i) => startWeek + i).map(weekNum => {
                const data = weeklyData[weekNum] ?? { status: "", notes: "" };
                // Past-week lock honors the admin feature flag; future-week lock is absolute.
                const isPast = !canEditPastWeek && priorityCurrentWeek !== null && weekNum < priorityCurrentWeek;
                const isFuture = priorityCurrentWeek !== null && weekNum > priorityCurrentWeek;
                const weekLocked = readOnly || isPast || isFuture;
                const weekTitle =
                  isFuture ? "Future week — not yet available"
                  : isPast ? "Past week locked — enable editing in Settings > Configurations"
                  : readOnly && !logsOnly ? "Read-only"
                  : undefined;
                return (
                  <div key={weekNum} className={`border border-gray-200 rounded-lg p-3 space-y-2 ${isFuture ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-gray-700">Week {weekNum}</span>
                        <span className="text-[10px] text-gray-400 ml-2">
                          {priorityWeekLabels[weekNum - 1] ?? weekDateLabel(priority.year, priority.quarter, weekNum, getQuarterStartDate(priority.year, priority.quarter), effectiveMeetingDay, getQuarterEndDate(priority.year, priority.quarter))}
                        </span>
                        {isPast && <span className="ml-2 text-[10px] text-amber-600">· past-week locked</span>}
                        {isFuture && <span className="ml-2 text-[10px] text-gray-400">· future week</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {STATUS_PILL_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => handleWeeklyStatusChange(weekNum, opt.value)}
                            disabled={weekLocked}
                            title={weekTitle}
                            className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${data.status === opt.value ? opt.selectedClass : opt.baseClass} ${weekLocked ? "cursor-not-allowed opacity-60" : ""}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={data.notes}
                      onChange={e => { setWeeklyData(prev => ({ ...prev, [weekNum]: { ...prev[weekNum], status: prev[weekNum]?.status ?? "", notes: e.target.value } })); setSavedFlash(false); }}
                      readOnly={weekLocked}
                      placeholder={weekLocked ? "" : "Notes for this week…"}
                      title={weekTitle}
                      rows={2}
                      className={`w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none text-gray-600 placeholder-gray-300 ${weekLocked ? "bg-gray-50 cursor-not-allowed" : ""}`}
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
        </fieldset>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {/* Dirty / saved hint (weekly tab only) */}
          {tab === "weekly" && !logsOnly && canUpdate && (() => {
            const dirtyCount = getDirtyWrites().length;
            if (dirtyCount > 0) {
              return (
                <span className="mr-auto text-[10px] text-amber-600 italic">
                  {dirtyCount} week{dirtyCount === 1 ? "" : "s"} changed — unsaved
                </span>
              );
            }
            if (savedFlash) {
              return <span className="mr-auto text-[10px] text-green-600 italic">Saved ✓</span>;
            }
            return null;
          })()}
          <button onClick={requestClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Cancel
          </button>
          {canUpdate && tab !== "weekly" && !logsOnly && (
            <button onClick={handleSave} disabled={saving || readOnly}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Save Changes
            </button>
          )}
          {canUpdate && tab === "weekly" && !logsOnly && (
            <button onClick={handleSaveWeekly} disabled={saving || getDirtyWrites().length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Save Weekly changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
