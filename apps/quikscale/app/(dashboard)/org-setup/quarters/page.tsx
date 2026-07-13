"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, ChevronDown, Calendar,
  Plus, X, Pencil, Trash2, MoreVertical, Filter,
  CalendarDays, Lock, Info,
} from "lucide-react";
import { invalidateFiscalYearsCache } from "@/lib/hooks/useFiscalYears";
import { invalidateCurrentWeekCache } from "@/lib/hooks/useCurrentWeek";
import { invalidateQuarterStartDatesCache } from "@/lib/hooks/useQuarterStartDates";
import { resolveQuarterInitDefaults } from "@/lib/utils/quarterInit";
import {
  generateMonthlyQuarterDates, chainQuarterDates, isMonthBasedWeekCounts,
  addMonthsUTC, addDays, diffDays,
} from "@/lib/utils/quarterGen";
import { generateMeetingDayWeeks, meetingDayIndex } from "@/lib/utils/fiscal";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton, Pagination,
} from "@quikit/ui";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useCustomQuarterSettings, useWeeklyMeetingDay } from "@/lib/hooks/useFeatureFlags";
import { notify } from "@/lib/utils/notify";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface QuarterRow {
  id:                 string;
  fiscalYear:         number;
  quarter:            string;
  startDate:          string;
  endDate:            string;
  weekCount:          number;
  createdAt:          string;
  updatedAt:          string;
  createdBy:          string;
  createdByName:      string;
  createdByInitials:  string;
}

/** Days of the week for the (informational) weekly meeting day picker. */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const QUARTER_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Q1: { bg: "bg-accent-50",   text: "text-accent-700",   dot: "bg-accent-500"   },
  Q2: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  Q3: { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500"  },
  Q4: { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500"  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return "—"; }
}

function toInputDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}

/**
 * Drop every quarter-derived module cache after a quarter mutation. Week-aware
 * surfaces (KPI grid size, Priority week labels, current-week/quarter) read
 * `QuarterSetting` through in-memory caches populated once per SPA session; if
 * we only invalidate the fiscal-years cache, those keep a pre-mutation snapshot
 * (e.g. `useQuarterWeekCount` falling back to 13) until a hard reload. Clearing
 * all three means the next mount of any week-aware view refetches the real
 * counts — no reload needed. See spec §10.
 */
function invalidateAllQuarterCaches() {
  invalidateFiscalYearsCache();
  invalidateCurrentWeekCache();
  invalidateQuarterStartDatesCache();
}

function getCurrentQuarterAndWeek(rows: QuarterRow[]): { quarter: string; week: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of rows) {
    const s = new Date(r.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(r.endDate);   e.setHours(23, 59, 59, 999);
    if (today >= s && today <= e) {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const week   = Math.min(r.weekCount ?? 13, Math.max(1, Math.floor((today.getTime() - s.getTime()) / weekMs) + 1));
      return { quarter: r.quarter, week };
    }
  }
  return null;
}

/* ─── QuarterBadge ────────────────────────────────────────────────────────────── */
function QuarterBadge({ quarter }: { quarter: string }) {
  const c = QUARTER_COLORS[quarter] ?? QUARTER_COLORS.Q1;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {quarter}
    </span>
  );
}

/* ─── Edit Panel ─────────────────────────────────────────────────────────────── */
function EditPanel({
  open, onClose, onSaved, row,
  canUpdate = true,
}: {
  open:    boolean;
  onClose: () => void;
  onSaved: (rows: QuarterRow[]) => void;
  row:     QuarterRow | null;
  /** RBAC v2 — when denied, fields are disabled and Save is hidden. */
  canUpdate?: boolean;
}) {
  const customEnabled = useCustomQuarterSettings();
  const meetingDay = useWeeklyMeetingDay();
  // Meeting-day mode: week count is derived from the meeting day, so the manual
  // "Number of weeks" input is hidden and never sent (server ignores it too).
  const meetingDayMode = customEnabled && meetingDayIndex(meetingDay) !== null;
  const [startDate, setStartDate] = useState("");
  const [weeks,     setWeeks]     = useState("13");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (open && row) {
      setStartDate(toInputDate(row.startDate));
      setWeeks(String(row.weekCount ?? 13));
      setError("");
    }
  }, [open, row]);

  const isQ1Row = row?.quarter === "Q1";

  async function handleSubmit() {
    // In custom mode, only Q1 needs a start date; other quarters chain off it.
    if ((!customEnabled || isQ1Row) && !startDate) { setError("Start date is required."); return; }

    const weeksNum = parseInt(weeks, 10);
    if (customEnabled && !meetingDayMode && (!Number.isFinite(weeksNum) || weeksNum < 1)) {
      setError("Enter a valid number of weeks.");
      return;
    }

    // Meeting-day mode: weekCount is derived server-side — send only Q1's start
    // (other quarters have nothing to edit; saving just re-derives the FY).
    const body = customEnabled
      ? (meetingDayMode
          ? (isQ1Row ? { startDate } : {})
          : { ...(isQ1Row ? { startDate } : {}), weekCount: weeksNum })
      : { startDate };

    setSaving(true); setError("");
    try {
      const res  = await fetch(`/api/org/quarters/${row!.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to save"); return; }
      notify.saved("Quarter", "updated");
      onSaved(json.data);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
      notify.error(err, { context: "quarter" });
    } finally { setSaving(false); }
  }

  if (!open || !row) return null;

  const weeksNumPreview = parseInt(weeks, 10) || 13;

  // Live single-quarter end preview. This quarter's own start is Q1's editable
  // start date (Q1 row) or the fixed persisted start (other rows). In custom
  // mode a 13-week quarter is month-aligned (end = start + 3 months − 1 day);
  // any other week count spans weeks×7 days. Legacy Q1 uses the 91-day split.
  const parsedStart = startDate ? new Date(startDate) : null;
  const qStartForPreview = isQ1Row ? parsedStart : new Date(row.startDate);
  const qEndPreview = qStartForPreview && !isNaN(qStartForPreview.getTime())
    ? (customEnabled
        ? (weeksNumPreview === 13
            ? addDays(addMonthsUTC(qStartForPreview, 3), -1)
            : addDays(qStartForPreview, weeksNumPreview * 7 - 1))
        : (parsedStart ? addDays(parsedStart, 91 - 1) : null))
    : null;
  // Legacy day-count split shows the full 4-quarter preview off Q1's start.
  const fyEndPreview = !customEnabled && parsedStart
    ? new Date(new Date(startDate).setFullYear(parsedStart.getFullYear() + 1, parsedStart.getMonth(), parsedStart.getDate() - 1))
    : null;
  const computedEnd = qEndPreview ? fmtDate(qEndPreview.toISOString()) : fmtDate(row.endDate);

  return (
    <RightPanel
      open
      onClose={onClose}
      size="sm"
      title={`${row.quarter} · FY ${row.fiscalYear}-${String(row.fiscalYear + 1).slice(-2)}`}
      subtitle={customEnabled
        ? "Set this quarter's weeks (and Q1's start date) — following quarters recalculate automatically"
        : "Change Q1 start date — all quarters will recalculate automatically"}
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          {canUpdate && (
            <RightPanelSubmitButton
              onClick={handleSubmit}
              saving={saving}
              icon="check"
              label="Save & Recalculate"
            />
          )}
        </RightPanelFooter>
      }
    >
          {!canUpdate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-3">
              Read-only — your role doesn&apos;t grant update access on Quarter Settings.
            </div>
          )}
          <fieldset disabled={!canUpdate} className={!canUpdate ? "opacity-70 space-y-4" : "space-y-4"}>
          {meetingDayMode && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Meeting Day</label>
              <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">
                {meetingDay}
                <span className="text-[10px] ml-2 text-gray-300">(read-only)</span>
              </div>
            </div>
          )}

          {(!customEnabled || isQ1Row) && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Start Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setError(""); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
          )}

          {customEnabled && !meetingDayMode && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Number of weeks <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={26}
                value={weeks}
                onChange={e => { setWeeks(e.target.value); setError(""); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
              {!isQ1Row && (
                <p className="text-[10px] text-gray-400 mt-1">This quarter starts the day after the previous one ends.</p>
              )}
            </div>
          )}

          {meetingDayMode && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Number of weeks</label>
              <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">
                {row.weekCount ?? 13} weeks
                <span className="text-[10px] ml-2 text-gray-300">(derived from {meetingDay} meeting day)</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Each week runs {meetingDay} → the day before the next {meetingDay}. Week counts
                (13 or 14, incl. partial weeks) update automatically{isQ1Row ? " when you change the start date" : ""}.
              </p>
            </div>
          )}

          {/* End date read-only — live calculated */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">End Date</label>
            <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">
              {computedEnd}
              <span className="text-[10px] ml-2 text-gray-300">(auto-calculated)</span>
            </div>
          </div>

          {/* Live quarter preview (legacy day-count split only) */}
          {!customEnabled && parsedStart && fyEndPreview && (() => {
            const days = [91, 91, 91];
            const names = ["Q1", "Q2", "Q3", "Q4"];
            const preview: { name: string; start: Date; end: Date; days: number }[] = [];
            let cursor = new Date(parsedStart.getTime());
            for (let i = 0; i < 4; i++) {
              const qStart = new Date(cursor.getTime());
              const qEnd = i === 3
                ? fyEndPreview
                : new Date(new Date(cursor.getTime()).setDate(cursor.getDate() + 90));
              const qDays = Math.round((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
              preview.push({ name: names[i], start: qStart, end: qEnd, days: qDays });
              if (i < 3) cursor = new Date(new Date(qEnd.getTime()).setDate(qEnd.getDate() + 1));
            }
            return (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Quarter Preview</p>
                {preview.map(q => {
                  const c = QUARTER_COLORS[q.name] ?? QUARTER_COLORS.Q1;
                  return (
                    <div key={q.name} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${c.bg}`}>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${c.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{q.name}
                      </span>
                      <span className="text-[11px] text-gray-600 flex-1">
                        {fmtDate(q.start.toISOString())} → {fmtDate(q.end.toISOString())}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium">{q.days}d</span>
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-400 mt-1">
                  FY ends: {fmtDate(fyEndPreview.toISOString())} &middot; {Math.round((fyEndPreview.getTime() - parsedStart.getTime()) / 86400000) + 1} total days
                </p>
              </div>
            );
          })()}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          </fieldset>
    </RightPanel>
  );
}

/* ─── Confirm Delete Fiscal Year ─────────────────────────────────────────────
 *
 * Hard-delete confirmation for an entire FY (all 4 QuarterSetting rows).
 * Shown from the More menu in Quarter Settings. The copy below makes the
 * blast radius explicit — existing KPI / Priority / OPSP rows that reference
 * the year by value keep their raw values, but the year will disappear from
 * the FiscalPeriodPicker.
 */
function ConfirmDeleteFY({
  open, year, saving, onConfirm, onCancel,
}: { open: boolean; year: number | null; saving: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open || year === null) return null;
  const label = `FY ${year}-${String(year + 1).slice(-2)}`;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
        <h3 className="text-sm font-bold text-gray-900 mb-2">Delete {label}?</h3>
        <p className="text-xs text-gray-600 mb-2">
          This will permanently delete <span className="font-semibold">all 4 quarters</span> for {label} from the database. This action <span className="font-semibold">cannot be undone</span>.
        </p>
        <p className="text-[11px] text-gray-500 mb-5">
          Existing KPI, Priority, and OPSP records referencing {label} will keep their raw values but the year will no longer appear in fiscal-year pickers until it is re-initialized.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={saving} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={saving} className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50">
            {saving ? "Deleting…" : `Delete ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Generate Modal ─────────────────────────────────────────────────────────── */
function GenerateModal({
  open, onClose, onGenerated, existingYears, futureYearAvailable, latestEndDate,
}: {
  open:          boolean;
  onClose:       () => void;
  onGenerated:   (rows: QuarterRow[]) => void;
  existingYears: number[];
  futureYearAvailable: number | null;
  /** ISO string of the latest endDate across all existing quarters (tenant-wide). */
  latestEndDate: string | null;
}) {
  const customEnabled = useCustomQuarterSettings();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [startDate, setStartDate] = useState("");
  // Custom Quarter Settings: per-quarter weeks + informational meeting day.
  const [weekCounts, setWeekCounts] = useState<string[]>(["13", "13", "13", "13"]);
  const [meetingDay, setMeetingDay] = useState("Wednesday");

  // The phantom future-year placeholder lives inside `existingYears` (the API
  // injects it when the `enable_future_quarters` flag is on so it shows up in
  // the picker), but no DB rows exist for it yet. Strip it before any
  // "already exists" reasoning so we don't mistreat the year the user is
  // here to initialize as something already done.
  const trulyExistingYears = futureYearAvailable != null
    ? existingYears.filter((y) => y !== futureYearAvailable)
    : existingYears;

  // FY / start-date defaults are derived by a pure, unit-tested helper so the
  // "delete all then re-initialize" reload bug stays fixed: given fresh
  // post-delete inputs (existingYears=[], latestEndDate=null) it resolves back
  // to the current FY with no `minStart` lock instead of jumping a year ahead.
  const { nextFY, defaultStart, minStart, isFutureFY } = resolveQuarterInitDefaults({
    existingYears,
    futureYearAvailable,
    latestEndDate,
  });

  // Block only when a future FY is requested AND the `enable_future_quarters`
  // feature flag is off. The server returns `futureYearAvailable != null`
  // whenever the flag is on, regardless of proximity to the current Q end.
  const isBlocked = isFutureFY && futureYearAvailable === null;

  useEffect(() => {
    if (open) { setError(""); setStartDate(defaultStart); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Derive FY year from the picked start date
  const parsedStart = startDate ? new Date(startDate) : null;
  const derivedFY = parsedStart ? parsedStart.getFullYear() : nextFY;

  // Calculate FY end and quarter date previews. Legacy uses the 91/91/91/92(93)
  // day-count split. Custom mode branches the same way the server does: all-13
  // weeks → month-based 3-month intervals (365/366 days, calendar-aligned); any
  // week ≠ 13 → week-based (weeks×7, FY length floats to the sum).
  // Meeting-day mode: quarter dates are always calendar-month based and each
  // quarter's week count is DERIVED from the meeting-day chain (13 or 14, incl.
  // partial weeks). The manual per-quarter week inputs are hidden and stay 13.
  const meetingDayIdxNum = customEnabled ? meetingDayIndex(meetingDay) : null;
  const weekCountsNum = weekCounts.map((w) => parseInt(w, 10) || 13);
  // In meeting-day mode force month-based generation regardless of week inputs.
  const customMonthBased = meetingDayIdxNum !== null ? true : isMonthBasedWeekCounts(weekCountsNum);
  const fyEndPreview = parsedStart
    ? new Date(new Date(startDate).setFullYear(parsedStart.getFullYear() + 1, parsedStart.getMonth(), parsedStart.getDate() - 1))
    : null;
  const totalDaysPreview = parsedStart && fyEndPreview
    ? Math.round((fyEndPreview.getTime() - parsedStart.getTime()) / 86400000) + 1
    : 365;
  const q4DaysPreview = totalDaysPreview === 366 ? 93 : 92;

  const quarterPreviews = parsedStart ? (
    customEnabled
      ? (customMonthBased
          ? generateMonthlyQuarterDates(parsedStart)
          : chainQuarterDates(parsedStart, weekCountsNum)
        ).map((q) => ({
          name: q.quarter,
          start: q.startDate,
          end: q.endDate,
          days: diffDays(q.startDate, q.endDate) + 1,
          weeks: meetingDayIdxNum !== null
            ? generateMeetingDayWeeks(q.startDate, q.endDate, meetingDayIdxNum, q.quarter === "Q1").length
            : undefined,
        }))
      : (() => {
          const days = [91, 91, 91, q4DaysPreview];
          const names = ["Q1", "Q2", "Q3", "Q4"];
          const result: { name: string; start: Date; end: Date; days: number; weeks?: number }[] = [];
          let cursor = new Date(parsedStart.getTime());
          for (let i = 0; i < 4; i++) {
            const qStart = new Date(cursor.getTime());
            const qEnd = new Date(cursor.getTime());
            qEnd.setDate(qEnd.getDate() + days[i] - 1);
            result.push({ name: names[i], start: qStart, end: qEnd, days: days[i] });
            cursor = new Date(qEnd.getTime());
            cursor.setDate(cursor.getDate() + 1);
          }
          return result;
        })()
  ) : [];
  const effectiveFyEnd = quarterPreviews.length === 4 ? quarterPreviews[3].end : fyEndPreview;
  const effectiveTotalDays = quarterPreviews.length === 4
    ? quarterPreviews.reduce((s, q) => s + q.days, 0)
    : totalDaysPreview;
  // Leap badge shows in BOTH modes — month-based quarters absorb Feb 29
  // naturally, so a 366-day FY is meaningful in Custom mode too.
  const isLeapPreview = effectiveTotalDays === 366;

  const fyLabel = `FY ${derivedFY}-${String(derivedFY + 1).slice(-2)}`;

  async function handleGenerate() {
    if (!startDate) { setError("Please select a start date."); return; }
    if (trulyExistingYears.includes(derivedFY)) { setError(`FY ${derivedFY}-${String(derivedFY + 1).slice(-2)} already exists.`); return; }

    const customBody = customEnabled
      ? {
          weekCounts: weekCounts.map((w) => parseInt(w, 10) || 13),
          weeklyMeetingDay: meetingDay,
        }
      : {};

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/org/quarters", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fiscalYear: derivedFY, startDate, ...customBody }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Failed to generate"); return; }
      notify.saved("Quarter", "created");
      onGenerated(json.data);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      notify.error(err, { context: "quarter" });
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Initialize Quarters</h3>

        {isBlocked ? (
          <>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 my-4">
              <p className="text-xs font-medium text-amber-800 mb-1">Future quarters are disabled</p>
              <p className="text-[11px] text-amber-600">
                The current FY already has all 4 quarters configured. To add the next fiscal year, toggle <span className="font-semibold">&quot;Enable future quarters&quot;</span> in Settings &gt; Configurations.
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          </>
        ) : (
        <>
        <p className="text-xs text-gray-500 mb-4">
          {customEnabled
            ? "Set the financial year start date and weekly meeting day. Quarters use calendar-month boundaries and each week follows the meeting-day cycle; weeks per quarter are derived automatically."
            : "Set the financial year start date. Quarters will be generated using day-count distribution."}
        </p>

        {/* Date picker */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-1.5">FY Start Date</label>
          <input
            type="date"
            value={startDate}
            min={minStart}
            onChange={e => { setStartDate(e.target.value); setError(""); }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
          {minStart && (
            <p className="text-[10px] text-gray-400 mt-1">Earliest allowed: {fmtDate(minStart)} (day after previous FY ends).</p>
          )}
        </div>

        {/* Custom Quarter Settings: meeting day + per-quarter week counts */}
        {customEnabled && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Weekly Meeting Day</label>
              <select
                value={meetingDay}
                onChange={e => setMeetingDay(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
              >
                {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-gray-400">
              Quarters use calendar-month boundaries. Each week runs {meetingDay} → the day
              before the next {meetingDay}; the weeks per quarter (13 or 14, including partial
              weeks at quarter edges) are derived automatically from the meeting day.
            </p>
          </div>
        )}

        {/* Preview */}
        {startDate && quarterPreviews.length > 0 && (
          <div className="mb-4 space-y-2">
            {/* FY summary header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <div>
                <p className="text-xs font-bold text-gray-800">{fyLabel}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {fmtDate(startDate)} → {effectiveFyEnd ? fmtDate(effectiveFyEnd.toISOString()) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-700">{effectiveTotalDays} days</p>
                {isLeapPreview && <p className="text-[10px] text-amber-600 font-medium">Leap year</p>}
              </div>
            </div>

            {/* Quarter breakdown */}
            {quarterPreviews.map((q) => {
              const colors = QUARTER_COLORS[q.name] ?? QUARTER_COLORS.Q1;
              return (
                <div key={q.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${colors.bg} border-opacity-50`} style={{ borderColor: "transparent" }}>
                  <div className="flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${colors.bg} ${colors.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                      {q.name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-700">
                      {fmtDate(q.start.toISOString())} → {fmtDate(q.end.toISOString())}
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium flex-shrink-0 text-right">
                    {q.weeks != null && <span className="block text-gray-700">{q.weeks} weeks</span>}
                    {q.days} days
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleGenerate}
            disabled={saving || !startDate}
            className="px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50"
          >
            {saving ? "Generating…" : "Generate Quarters"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function QuarterSettingsPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("Quarter");
  const customEnabled = useCustomQuarterSettings();
  const meetingDay = useWeeklyMeetingDay();
  const meetingDayActive = customEnabled && meetingDayIndex(meetingDay) !== null;
  const [rows,          setRows]          = useState<QuarterRow[]>([]);
  const [allYears,      setAllYears]      = useState<number[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterQ,       setFilterQ]       = useState("");
  const [filterOpen,    setFilterOpen]    = useState(false);
  const [yearOpen,      setYearOpen]      = useState(false);
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [selectedYear,  setSelectedYear]  = useState<number | null>(null);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [editRow,       setEditRow]       = useState<QuarterRow | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [deleteFY,      setDeleteFY]      = useState<number | null>(null);
  const [deletingFY,    setDeletingFY]    = useState(false);
  const [generateOpen,  setGenerateOpen]  = useState(false);
  const [futureYearAvailable, setFutureYearAvailable] = useState<number | null>(null);
  const [latestEndDate, setLatestEndDate] = useState<string | null>(null);
  const [hasDataByYear, setHasDataByYear] = useState<Record<number, boolean>>({});

  const filterRef = useRef<HTMLDivElement>(null);
  const yearRef   = useRef<HTMLDivElement>(null);
  const moreRef   = useRef<HTMLDivElement>(null);

  // Default fiscal year = current
  const defaultFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const fetchRows = useCallback(async (year?: number) => {
    setLoading(true);
    try {
      const url  = `/api/org/quarters${year !== undefined ? `?year=${year}` : ""}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setAllYears(json.availableYears ?? []);
        setFutureYearAvailable(json.futureYearAvailable ?? null);
        setLatestEndDate(json.latestEndDate ?? null);
        if (json.hasDataByYear) setHasDataByYear(prev => ({ ...prev, ...(json.hasDataByYear as Record<number, boolean>) }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: show current FY if it exists, else all
  useEffect(() => {
    (async () => {
      const res  = await fetch("/api/org/quarters");
      const json = await res.json();
      if (json.success) {
        const years: number[] = json.availableYears ?? [];
        setAllYears(years);
        setFutureYearAvailable(json.futureYearAvailable ?? null);
        setLatestEndDate(json.latestEndDate ?? null);
        if (json.hasDataByYear) setHasDataByYear(json.hasDataByYear as Record<number, boolean>);
        const fy = years.includes(defaultFY) ? defaultFY : (years[0] ?? defaultFY);
        setSelectedYear(fy);
        const filtered = (json.data as QuarterRow[]).filter(r => r.fiscalYear === fy);
        setRows(filtered);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (yearRef.current   && !yearRef.current.contains(e.target as Node))   setYearOpen(false);
      if (moreRef.current   && !moreRef.current.contains(e.target as Node))   setMoreOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleYearChange(y: number) {
    setSelectedYear(y);
    setYearOpen(false);
    setSelectedIds(new Set());
    fetchRows(y);
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filterQ && r.quarter !== filterQ) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.quarter.toLowerCase().includes(q) || fmtDate(r.startDate).includes(q) || fmtDate(r.endDate).includes(q);
    }
    return true;
  }), [rows, search, filterQ]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(r => r.id)));
  }

  function handleSaved(updated: QuarterRow[]) {
    setRows(updated);
    // Week counts / boundaries may have changed — clear the quarter caches so
    // week-aware views (KPI grid, Priority labels) pick them up without reload.
    invalidateAllQuarterCaches();
  }

  function handleGenerated(newRows: QuarterRow[]) {
    if (newRows.length > 0) {
      const fy = newRows[0].fiscalYear;
      setSelectedYear(fy);
      setAllYears(prev => [...new Set([...prev, fy])].sort((a, b) => b - a));
      fetchRows(fy);
      invalidateAllQuarterCaches();
    }
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    try {
      await Promise.all([...selectedIds].map(id => fetch(`/api/org/quarters/${id}`, { method: "DELETE" })));
      setSelectedIds(new Set());
      invalidateAllQuarterCaches();
      // Re-fetch from the server so `allYears` + `latestEndDate` reflect reality.
      // A local row filter alone left those stale, so the Initialize modal kept
      // anchoring to the deleted FY's end date and forced a manual page reload.
      await fetchRows(selectedYear ?? undefined);
      notify.success(`Deleted ${count} quarter${count === 1 ? "" : "s"}`);
    } catch (err: unknown) {
      notify.error(err, { context: "quarter" });
    }
  }

  // Hard-delete an entire fiscal year (all 4 quarters). Server endpoint:
  // DELETE /api/org/quarters?year=YYYY. After success, switch the page to the
  // next available FY (or clear view if none remain).
  async function handleDeleteFY(year: number) {
    setDeletingFY(true);
    try {
      const res = await fetch(`/api/org/quarters?year=${year}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to delete fiscal year");

      const nextYears = allYears.filter(y => y !== year);
      setAllYears(nextYears);
      setSelectedIds(new Set());
      setDeleteFY(null);
      // Drop all quarter-derived caches so every picker + week-aware view refetches.
      invalidateAllQuarterCaches();

      if (nextYears.length) {
        const nextYear = nextYears.includes(defaultFY) ? defaultFY : nextYears[0];
        setSelectedYear(nextYear);
        await fetchRows(nextYear);
      } else {
        // No fiscal years left. Reset to the clean state a page reload would
        // produce — default FY selected, all server-derived meta cleared — so
        // the user can re-initialize immediately without reloading. Leaving
        // `latestEndDate` stale here is exactly what forced the reload.
        setSelectedYear(defaultFY);
        setRows([]);
        setLatestEndDate(null);
        setFutureYearAvailable(null);
        setHasDataByYear({});
      }
      notify.saved("Quarter", "deleted", {
        description: `FY ${year}-${String(year + 1).slice(-2)} removed.`,
      });
    } catch (err) {
      console.error("[quarters] delete FY failed:", err);
      notify.error(err, { context: "quarter" });
    } finally {
      setDeletingFY(false);
    }
  }

  const currentQW  = getCurrentQuarterAndWeek(rows);
  const fyLabel    = selectedYear ? `FY ${selectedYear}-${String(selectedYear + 1).slice(-2)}` : "—";
  const fyHasData  = hasDataByYear[selectedYear ?? 0] ?? false;
  const activeFilters = (filterQ ? 1 : 0);

  // Pagination — default 10 rows, options 10/20/30/50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [selectedYear, search, filterQ, pageSize]);
  const pagedQuarters = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalQuarterPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  /* ── Table view ── */
  const TableView = () => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-auto min-h-0">
      <table className="border-separate border-spacing-0 text-xs" style={{ minWidth: 600, width: "100%" }}>
        <thead className="sticky top-0 z-30">
          <tr>
            <th className="sticky z-[35] bg-accent-50 border-b border-r border-gray-200 px-2 py-2 w-10">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleAll}
                className="rounded border-gray-300 text-accent-600 cursor-pointer"
              />
            </th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2 w-14">ID</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">Quarter</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">Start Date</th>
            <th className="text-left text-xs font-semibold text-gray-500 bg-accent-50 border-b border-r border-gray-200 px-3 py-2">End Date</th>
            <th className="bg-accent-50 border-b border-r border-gray-200 px-3 py-2 w-20" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="text-center py-16 text-xs text-gray-400">Loading…</td></tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-16">
                <div className="flex flex-col items-center gap-2">
                  <CalendarDays className="h-8 w-8 text-gray-200" />
                  <p className="text-sm text-gray-400 font-medium">No quarters found</p>
                  <p className="text-xs text-gray-400">Click <span className="font-semibold">Initialize Quarters</span> to generate.</p>
                </div>
              </td>
            </tr>
          ) : pagedQuarters.map((row, idx) => {
            const isQ1 = row.quarter === "Q1";
            // Legacy: only Q1 editable. Custom: every quarter editable (weeks).
            const rowEditable = customEnabled || isQ1;
            const canEdit = rowEditable && !fyHasData;
            return (
            <tr
              key={row.id}
              className={`group transition-colors ${canEdit ? "hover:bg-accent-50/30 cursor-pointer" : ""} ${selectedIds.has(row.id) ? "bg-accent-50/60" : ""}`}
              onClick={() => { if (canEdit) { setEditRow(row); setPanelOpen(true); } }}
            >
              <td className="px-2 py-2 border-b border-r border-gray-100" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  onChange={() => toggleSelect(row.id)}
                  className="rounded border-gray-300 text-accent-600 cursor-pointer"
                />
              </td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs font-semibold text-accent-600">{(page - 1) * pageSize + idx + 1}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100"><QuarterBadge quarter={row.quarter} /></td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs text-gray-700">{fmtDate(row.startDate)}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100 text-xs text-gray-700">{fmtDate(row.endDate)}</td>
              <td className="px-3 py-2 border-b border-r border-gray-100" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {rowEditable && (
                    fyHasData ? (
                      <span title={customEnabled ? "Quarter cannot be changed — data exists for this fiscal year" : "Start date cannot be changed — data exists for this fiscal year"}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-300 cursor-not-allowed">
                        <Lock className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditRow(row); setPanelOpen(true); }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                  {/* Per-row delete intentionally removed — Quarter rows are
                      a fixed Q1..Q4 set per fiscal year and only the FY-level
                      Delete (in the header three-dot menu) is exposed. The
                      Pencil above still edits Q1's start date when the year
                      has no goals yet. */}
                </div>
              </td>
            </tr>
          );})}
        </tbody>
      </table>
      </div>
      {filtered.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalQuarterPages}
          total={filtered.length}
          limit={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Quarter Settings</h1>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
          {currentQW && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-50 text-accent-600 text-xs font-medium border border-accent-200">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500 inline-block" />
              Quarter: {currentQW.quarter} • Week {currentQW.week}
            </span>
          )}
          {meetingDayActive && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-50 text-accent-600 text-xs font-medium border border-accent-200">
              <CalendarDays className="h-3 w-3" />
              Meeting Day: {meetingDay}
            </span>
          )}
          {fyHasData && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
              <Lock className="h-3 w-3" />
              Locked — data exists for {fyLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* Bulk delete */}
        {selectedIds.size > 0 && (
          fyHasData ? (
            <span title="Data exists for this fiscal year — quarters cannot be deleted"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-gray-200 bg-gray-50 rounded-lg cursor-not-allowed">
              <Lock className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
            </span>
          ) : (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
            </button>
          )
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
          />
        </div>

        {/* Filter */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg ${activeFilters > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFilters > 0 && <span className="bg-accent-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{activeFilters}</span>}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-44">
              <p className="text-xs font-semibold text-gray-700 mb-2">Quarter</p>
              <div className="space-y-1">
                <button onClick={() => setFilterQ("")}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${!filterQ ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                  All
                </button>
                {QUARTERS.map(q => (
                  <button key={q} onClick={() => { setFilterQ(q); setFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${filterQ === q ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year picker */}
        <div ref={yearRef} className="relative">
          <button
            onClick={() => setYearOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-300 bg-white rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            <Calendar className="h-3.5 w-3.5 text-accent-500" />
            {fyLabel}
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {yearOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
              {allYears.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No years yet.</p>
              ) : allYears.map(y => (
                <button key={y} onClick={() => handleYearChange(y)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${selectedYear === y ? "text-accent-600 font-semibold bg-accent-50" : "text-gray-700"}`}>
                  FY {y}-{String(y + 1).slice(-2)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More menu */}
        <div ref={moreRef} className="relative">
          <button onClick={() => setMoreOpen(o => !o)}
            className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            <MoreVertical className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
              {canCreate && (
                <button
                  onClick={() => { setGenerateOpen(true); setMoreOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5 text-accent-500" /> Initialize Quarters
                </button>
              )}
              {selectedYear !== null && canDelete && (
                fyHasData ? (
                  <span title="Data exists for this fiscal year — cannot delete"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 cursor-not-allowed">
                    <Lock className="h-3.5 w-3.5" /> Delete FY {selectedYear}-{String(selectedYear + 1).slice(-2)}
                  </span>
                ) : (
                  <button
                    onClick={() => { setDeleteFY(selectedYear); setMoreOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete FY {selectedYear}-{String(selectedYear + 1).slice(-2)}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lock-state banner ──
          Only show when an FY with quarter rows is selected. The wording is
          the contract that backs the server-side lock enforcement in
          PUT/DELETE /api/org/quarters/[id] + DELETE /api/org/quarters?year=. */}
      {selectedYear !== null && filtered.length > 0 && !loading && (
        fyHasData ? (
          <div className=" m-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs leading-relaxed text-amber-800 font-medium">
              Once you start entering the data into Goals, you won&apos;t be able to edit your quarters.
            </p>
          </div>
        ) : (
          <div className="mx-6 mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-amber-800 mb-0.5">Quarter dates are editable — for now</p>
              <p className="text-amber-700">
                Once you create a KPI, Priority, or OPSP goal for <span className="font-semibold">{fyLabel}</span>,
                the Q1 start date and all quarter dates will be permanently locked and cannot be deleted.
                Set your dates correctly before adding any data.
              </p>
            </div>
          </div>
        )
      )}

      {/* ── Content ── */}
      <TableView />

      {/* ── Edit Panel ── */}
      <EditPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        row={editRow}
        canUpdate={canUpdate}
      />

      {/* ── Confirm Delete Fiscal Year (hard delete of all 4 quarters) ── */}
      <ConfirmDeleteFY
        open={deleteFY !== null}
        year={deleteFY}
        saving={deletingFY}
        onConfirm={() => deleteFY !== null && handleDeleteFY(deleteFY)}
        onCancel={() => setDeleteFY(null)}
      />

      {/* ── Generate Modal ── */}
      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={handleGenerated}
        existingYears={allYears}
        futureYearAvailable={futureYearAvailable}
        latestEndDate={latestEndDate}
      />
    </div>
  );
}
