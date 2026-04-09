"use client";

import { useState } from "react";
import { useUpdateKPI, useUpdateWeeklyValue, useNotes, useAddNote } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import type { KPIRow, WeeklyValue, User } from "@/lib/types/kpi";
import { fiscalYearLabel, weekDateLabel, ALL_WEEKS, MEASUREMENT_UNITS, ALL_QUARTERS } from "@/lib/utils/fiscal";
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { UserPicker } from "@/components/UserPicker";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";

interface Props { kpi: KPIRow; onClose: () => void; onRefresh: () => void; initialTab?: Tab; }

type Tab = "edit" | "updates" | "stats";

const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

type EditFormState = {
  name: string; description: string; owner: string; teamId: string;
  parentKPIId: string; quarter: string; year: string; measurementUnit: string;
  target: string; quarterlyGoal: string; qtdGoal: string; status: string;
  divisionType: "Cumulative" | "Standalone";
  weeklyBreakdown: Record<number, string>;
  currency: string;
  targetScale: string;
};

// ── Edit Tab ──────────────────────────────────────────────────────────────────

/** Format a value based on measurement unit: whole number for Number, 2dp for others */
function fmtBreakdown(val: number, measurementUnit: string): string {
  if (measurementUnit === "Number") return String(Math.round(val));
  return val.toFixed(2);
}

/** Build a full 13-week breakdown from scratch */
function buildBreakdown(
  divisionType: "Cumulative" | "Standalone",
  targetNum: number,
  measurementUnit: string,
): Record<number, string> {
  const map: Record<number, string> = {};
  if (targetNum <= 0) { ALL_WEEKS.forEach(w => { map[w] = ""; }); return map; }

  if (divisionType === "Standalone") {
    const val = fmtBreakdown(targetNum, measurementUnit);
    ALL_WEEKS.forEach(w => { map[w] = val; });
    return map;
  }

  // Cumulative — floor-divide with remainder piled onto rightmost weeks
  if (measurementUnit === "Number") {
    const base = Math.floor(targetNum / 13);
    const extra = Math.round(targetNum - base * 13);
    ALL_WEEKS.forEach(w => {
      map[w] = String(13 - w < extra ? base + 1 : base);
    });
  } else {
    const base = parseFloat((targetNum / 13).toFixed(2));
    const diff  = parseFloat((targetNum - base * 13).toFixed(2));
    ALL_WEEKS.forEach(w => { map[w] = base.toFixed(2); });
    map[13] = (base + diff).toFixed(2);
  }
  return map;
}

function EditTab({
  form, setForm, errors, users,
}: {
  form: EditFormState;
  setForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  errors: Record<string, string>;
  users: User[];
}) {
  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  /** Compute the actual (scaled) target from display value + scale */
  function actualNum(f: EditFormState): number {
    const base = parseFloat(f.target) || 0;
    if (f.measurementUnit !== "Currency") return base;
    return base * getMultiplier(f.currency, f.targetScale);
  }

  function setMeasurementUnit(val: string) {
    setForm(f => {
      const n = val === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      return { ...f, measurementUnit: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, val) };
    });
  }

  function setCurrency(val: string) {
    setForm(f => {
      // Reset scale if it doesn't exist for the new currency
      const validScale = getScales(val).find(s => s.label === f.targetScale) ? f.targetScale : "";
      const n = (parseFloat(f.target) || 0) * getMultiplier(val, validScale);
      return { ...f, currency: val, targetScale: validScale, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit) };
    });
  }

  function setTargetScale(val: string) {
    setForm(f => {
      const n = (parseFloat(f.target) || 0) * getMultiplier(f.currency, val);
      return { ...f, targetScale: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit) };
    });
  }

  function setDivisionType(dt: "Cumulative" | "Standalone") {
    setForm(f => ({ ...f, divisionType: dt, weeklyBreakdown: buildBreakdown(dt, actualNum(f), f.measurementUnit) }));
  }

  function setTarget(val: string) {
    setForm(f => {
      const n = f.measurementUnit === "Currency"
        ? (parseFloat(val) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(val) || 0;
      return { ...f, target: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit) };
    });
  }

  function setWeekBreakdown(w: number, val: string) {
    setForm(f => {
      const newBreakdown = { ...f.weeklyBreakdown, [w]: val };
      if (f.divisionType !== "Cumulative") return { ...f, weeklyBreakdown: newBreakdown };

      const targetNum = actualNum(f);
      const isWhole = f.measurementUnit === "Number";
      let leftSum = 0;
      for (let i = 1; i <= w; i++) leftSum += parseFloat(String(newBreakdown[i])) || 0;

      const remaining = targetNum - leftSum;
      const rightCount = 13 - w;
      if (rightCount <= 0) return { ...f, weeklyBreakdown: newBreakdown };

      if (isWhole) {
        const base  = Math.floor(remaining / rightCount);
        const extra = Math.round(remaining - base * rightCount);
        for (let i = w + 1; i <= 13; i++) {
          newBreakdown[i] = String(13 - i < extra ? base + 1 : base);
        }
      } else {
        const base = parseFloat((remaining / rightCount).toFixed(2));
        const diff = parseFloat((remaining - base * rightCount).toFixed(2));
        for (let i = w + 1; i <= 13; i++) newBreakdown[i] = base.toFixed(2);
        newBreakdown[13] = (base + diff).toFixed(2);
      }
      return { ...f, weeklyBreakdown: newBreakdown };
    });
  }

  const isCurrency = form.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find(c => c.code === form.currency) ?? CURRENCIES[0];
  const scales = getScales(form.currency);
  const scaledTarget = isCurrency
    ? (parseFloat(form.target) || 0) * getMultiplier(form.currency, form.targetScale)
    : parseFloat(form.target) || 0;
  const targetNum = scaledTarget;

  return (
    <div className="space-y-4">
      {errors._ && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Owner <span className="text-red-500">*</span></label>
          <UserPicker value={form.owner} onChange={v => set("owner", v)} users={users} error={!!errors.owner} />
          {errors.owner && <p className="text-[10px] text-red-500 mt-0.5">{errors.owner}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">KPI Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
          {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Quarter <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <select value={form.year} onChange={e => set("year", e.target.value)}
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            {FISCAL_YEARS.map(y => <option key={y} value={String(y)}>{fiscalYearLabel(y)}</option>)}
          </select>
          <select value={form.quarter} onChange={e => set("quarter", e.target.value)}
            className="w-20 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            {ALL_QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
      </div>

      {/* Measurement Unit + Currency */}
      <div className={`grid gap-3 ${isCurrency ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Measurement Unit</label>
          <select value={form.measurementUnit} onChange={e => setMeasurementUnit(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            {MEASUREMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {isCurrency && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
            <select value={form.currency} onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Target Value */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Target Value</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
          {isCurrency && (
            <span className="flex items-center px-2.5 bg-gray-50 border-r border-gray-200 text-xs text-gray-500 select-none whitespace-nowrap flex-shrink-0">
              {currencyObj.symbol}
            </span>
          )}
          <input type="number" min="0" value={form.target} onChange={e => setTarget(e.target.value)}
            placeholder="0"
            className="flex-1 px-3 py-2 text-xs focus:outline-none bg-white min-w-0" />
          {isCurrency && (
            <select value={form.targetScale} onChange={e => setTargetScale(e.target.value)}
              className="border-l border-gray-200 pl-2 pr-1 py-2 text-xs bg-white focus:outline-none text-gray-600 flex-shrink-0 cursor-pointer">
              {scales.map(s => (
                <option key={s.label} value={s.label}>{s.label || "—"}</option>
              ))}
            </select>
          )}
        </div>
        {isCurrency && form.targetScale && scaledTarget > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            = {formatActual(scaledTarget, currencyObj.symbol, form.currency)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Division Type</label>
          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
            {(["Cumulative", "Standalone"] as const).map(dt => (
              <button key={dt} type="button" onClick={() => setDivisionType(dt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  form.divisionType === dt ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {dt}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {form.divisionType === "Cumulative" ? "Target split equally across 13 weeks" : "Each week carries the full target value"}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <div className="flex gap-3 mt-1">
            {(["active", "paused", "completed"] as const).map(s => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="editStatus" value={s} checked={form.status === s}
                  onChange={() => set("status", s)} className="text-blue-600" />
                <span className="text-xs text-gray-600 capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
          rows={3} placeholder="Enter description…"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
      </div>

      {targetNum > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Target Breakdown (Weekly)</label>
          <div className="border border-gray-200 rounded-lg overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {ALL_WEEKS.map(w => (
                    <th key={w} className="px-2 py-1.5 text-center text-gray-500 font-medium border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                      <div>W{w}</div>
                      <div className="text-[9px] font-normal text-gray-400">{weekDateLabel(parseInt(form.year), form.quarter, w)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {ALL_WEEKS.map(w => (
                    <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                      <input
                        type="number"
                        min="0"
                        value={form.weeklyBreakdown[w] ?? ""}
                        onChange={e => setWeekBreakdown(w, e.target.value)}
                        readOnly={form.divisionType === "Standalone"}
                        className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none min-w-[72px] ${
                          form.divisionType === "Standalone"
                            ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : "border-gray-200 focus:ring-1 focus:ring-blue-400"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {form.divisionType === "Cumulative"
              ? `Remainder distributed right-to-left — edit cells to override`
              : `Each week = full target${isCurrency ? ` (${currencyObj.symbol}${targetNum})` : ` (${targetNum})`}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Week Row (controlled, no autosave) ───────────────────────────────────────

function WeekRow({ weekNumber, value, notes, weeklyTarget, year, quarter, onValueChange, onNotesChange }: {
  weekNumber: number;
  value: string;
  notes: string;
  weeklyTarget: number;
  year: number;
  quarter: string;
  onValueChange: (v: string) => void;
  onNotesChange: (n: string) => void;
}) {
  const numVal = parseFloat(value);
  const hasValue = value !== "" && !isNaN(numVal);
  const barColor = hasValue
    ? numVal === 0 ? "bg-red-400" : weeklyTarget > 0 && numVal >= weeklyTarget ? "bg-blue-400" : "bg-green-400"
    : "bg-gray-200";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      {/* Week label + date range + mini bar */}
      <div className="w-24 flex-shrink-0 pt-1">
        <div className="text-xs font-semibold text-gray-600">Week {weekNumber}</div>
        <div className="text-[9px] text-gray-400 mt-0.5 leading-none">{weekDateLabel(year, quarter, weekNumber)}</div>
        <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
          {hasValue && weeklyTarget > 0 && (
            <div className={`h-1 rounded-full ${barColor}`}
              style={{ width: `${Math.min((numVal / weeklyTarget) * 100, 100)}%` }} />
          )}
        </div>
      </div>
      {/* Value input */}
      <div className="w-24 flex-shrink-0">
        <input type="number" min="0" value={value} onChange={e => onValueChange(e.target.value)}
          placeholder="—"
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-center" />
      </div>
      {/* Notes */}
      <div className="flex-1">
        <textarea value={notes} onChange={e => onNotesChange(e.target.value)}
          placeholder="Add a note for this week…"
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y min-h-[36px]" />
      </div>
    </div>
  );
}

// ── Updates Tab ───────────────────────────────────────────────────────────────

function UpdatesTab({
  kpi,
  weeklyState,
  setWeeklyState,
}: {
  kpi: KPIRow;
  weeklyState: Record<number, { value: string; notes: string }>;
  setWeeklyState: React.Dispatch<React.SetStateAction<Record<number, { value: string; notes: string }>>>;
}) {
  const { data: notesData, refetch: refetchNotes } = useNotes(kpi.id);
  const addNote = useAddNote(kpi.id);
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const weeklyTarget = (kpi.qtdGoal ?? kpi.target ?? 0) / 13;

  function handleWeekChange(weekNumber: number, field: "value" | "notes", val: string) {
    setWeeklyState(s => ({
      ...s,
      [weekNumber]: { ...s[weekNumber], [field]: val },
    }));
  }

  async function handleAddNote() {
    if (!noteInput.trim()) return;
    setAddingNote(true);
    try { await addNote.mutateAsync({ content: noteInput.trim() }); setNoteInput(""); refetchNotes(); }
    catch {} finally { setAddingNote(false); }
  }

  const notes = notesData ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-700">Weekly Values</h3>
          {weeklyTarget > 0 && (
            <span className="text-[10px] text-gray-400">Weekly target: {fmt(weeklyTarget)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-24 text-[10px] text-gray-400 font-medium">Week</div>
          <div className="w-24 text-[10px] text-gray-400 font-medium text-center">Value</div>
          <div className="flex-1 text-[10px] text-gray-400 font-medium">Notes</div>
        </div>
        <div className="border border-gray-200 rounded-lg px-3 bg-white">
          {ALL_WEEKS.map(w => (
            <WeekRow
              key={w}
              weekNumber={w}
              value={weeklyState[w]?.value ?? ""}
              notes={weeklyState[w]?.notes ?? ""}
              weeklyTarget={weeklyTarget}
              year={kpi.year}
              quarter={kpi.quarter}
              onValueChange={v => handleWeekChange(w, "value", v)}
              onNotesChange={n => handleWeekChange(w, "notes", n)}
            />
          ))}
        </div>
      </div>

      {/* Add comment */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Add Comment</h3>
        <div className="flex gap-2">
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleAddNote(); }}
            placeholder="Write a comment or update… (⌘↵ to submit)"
            rows={3}
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
          />
          <button onClick={handleAddNote} disabled={addingNote || !noteInput.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors whitespace-nowrap self-start">
            {addingNote ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* Notes history */}
      {notes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Comments ({notes.length})</h3>
          <div className="space-y-2">
            {notes.map((note: any) => (
              <div key={note.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-gray-600">
                    {note.author ? `${note.author.firstName} ${note.author.lastName}` : "Unknown"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(note.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ kpi }: { kpi: KPIRow }) {
  const colors = progressColor(kpi.progressPercent ?? 0);
  const target = kpi.qtdGoal ?? kpi.target ?? 0;
  const achieved = kpi.qtdAchieved ?? 0;
  const weeklyTarget = target / 13;

  const weekMap: Record<number, WeeklyValue> = {};
  (kpi.weeklyValues ?? []).forEach(w => { weekMap[w.weekNumber] = w; });

  const filledWeeks = ALL_WEEKS.filter(w => weekMap[w]?.value !== null && weekMap[w]?.value !== undefined);
  const avgPerWeek = filledWeeks.length > 0
    ? filledWeeks.reduce((s, w) => s + (weekMap[w]?.value ?? 0), 0) / filledWeeks.length
    : 0;
  const bestWeek = filledWeeks.reduce<number>((best, w) => {
    const v = weekMap[w]?.value ?? 0;
    return v > (weekMap[best]?.value ?? 0) ? w : best;
  }, filledWeeks[0] ?? 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-3">Overall Progress</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className={`text-3xl font-bold ${colors.text}`}>{(kpi.progressPercent ?? 0).toFixed(0)}%</div>
              <div className="text-xs text-gray-500 mt-0.5">{colors.label}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Achieved</div>
              <div className="text-lg font-semibold text-gray-800">{fmt(achieved)}</div>
              <div className="text-[10px] text-gray-400">of {fmt(target)} target</div>
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-3 rounded-full transition-all ${colors.bar}`}
              style={{ width: `${Math.min(kpi.progressPercent ?? 0, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Weeks Reported", value: String(filledWeeks.length) },
          { label: "Avg / Week", value: fmt(avgPerWeek) },
          { label: "Best Week", value: bestWeek ? `W${bestWeek}` : "—" },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Quarterly Goal", value: kpi.quarterlyGoal != null ? String(kpi.quarterlyGoal) : "—" },
          { label: "QTD Goal", value: kpi.qtdGoal != null ? String(kpi.qtdGoal) : "—" },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LogModal ──────────────────────────────────────────────────────────────────

export function LogModal({ kpi, onClose, onRefresh, initialTab = "updates" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: users = [] } = useUsers();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const updateKPI = useUpdateKPI(kpi.id);
  const updateWeekly = useUpdateWeeklyValue(kpi.id);

  // Edit form state (lifted up for unified save)
  const [editForm, setEditForm] = useState<EditFormState>(() => {
    const divisionType = (kpi.divisionType as "Cumulative" | "Standalone") ?? "Cumulative";
    const measurementUnit = kpi.measurementUnit;
    const currency = kpi.currency ?? "USD";
    const savedScale = (measurementUnit === "Currency" ? kpi.targetScale : null) ?? "";
    // Reverse-compute display value: stored target / multiplier
    const multiplier = measurementUnit === "Currency" ? getMultiplier(currency, savedScale) : 1;
    const storedTarget = kpi.target ?? 0;
    const displayTarget = multiplier > 1 ? storedTarget / multiplier : storedTarget;
    const savedWeeklyTargets = kpi.weeklyTargets as Record<string, number> | null | undefined;
    const weeklyBreakdown = savedWeeklyTargets
      ? Object.fromEntries(ALL_WEEKS.map(w => [w, String(savedWeeklyTargets[String(w)] ?? "")])) as Record<number, string>
      : buildBreakdown(divisionType, storedTarget, measurementUnit);
    return {
      name: kpi.name,
      description: kpi.description ?? "",
      owner: kpi.owner,
      teamId: kpi.teamId ?? "",
      parentKPIId: kpi.parentKPIId ?? "",
      quarter: kpi.quarter,
      year: String(kpi.year),
      measurementUnit,
      target: displayTarget > 0 ? String(displayTarget) : "",
      quarterlyGoal: kpi.quarterlyGoal?.toString() ?? "",
      qtdGoal: kpi.qtdGoal?.toString() ?? "",
      status: kpi.status ?? "active",
      divisionType,
      weeklyBreakdown,
      currency,
      targetScale: savedScale,
    };
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Weekly values state (lifted up for unified save)
  const [weeklyState, setWeeklyState] = useState<Record<number, { value: string; notes: string }>>(() => {
    const map: Record<number, { value: string; notes: string }> = {};
    for (let w = 1; w <= 13; w++) {
      const wv = (kpi.weeklyValues ?? []).find(x => x.weekNumber === w);
      map[w] = { value: wv?.value?.toString() ?? "", notes: wv?.notes ?? "" };
    }
    return map;
  });

  async function handleSave() {
    // Validate edit form
    const errs: Record<string, string> = {};
    if (!editForm.name.trim()) errs.name = "Required";
    if (!editForm.owner) errs.owner = "Required";
    if (Object.keys(errs).length) {
      setEditErrors(errs);
      setTab("edit");
      return;
    }
    setEditErrors({});

    setSaving(true);
    setSaveError("");
    try {
      const kpiPayload = {
        name: editForm.name.trim(),
        description: editForm.description || undefined,
        owner: editForm.owner,
        teamId: editForm.teamId || undefined,
        parentKPIId: editForm.parentKPIId || undefined,
        quarter: editForm.quarter as "Q1" | "Q2" | "Q3" | "Q4",
        year: parseInt(editForm.year),
        measurementUnit: editForm.measurementUnit as "Number" | "Percentage" | "Currency" | "Ratio",
        target: editForm.target
          ? (parseFloat(editForm.target) || 0) * (editForm.measurementUnit === "Currency" ? getMultiplier(editForm.currency, editForm.targetScale) : 1)
          : undefined,
        quarterlyGoal: editForm.quarterlyGoal ? parseFloat(editForm.quarterlyGoal) : undefined,
        qtdGoal: editForm.qtdGoal ? parseFloat(editForm.qtdGoal) : undefined,
        status: editForm.status as "active" | "paused" | "completed",
        divisionType: editForm.divisionType,
        currency: editForm.measurementUnit === "Currency" ? editForm.currency : null,
        targetScale: editForm.measurementUnit === "Currency" ? editForm.targetScale : null,
        weeklyTargets: Object.fromEntries(
          Object.entries(editForm.weeklyBreakdown)
            .map(([k, v]) => [k, parseFloat(v) || 0])
        ),
      };

      // Save KPI metadata + all weekly values in parallel
      await Promise.all([
        updateKPI.mutateAsync(kpiPayload),
        ...ALL_WEEKS.map(w => {
          const { value, notes } = weeklyState[w] ?? { value: "", notes: "" };
          return updateWeekly.mutateAsync({
            weekNumber: w,
            value: value !== "" ? parseFloat(value) : null,
            notes: notes || null,
          });
        }),
      ]);

      onRefresh();
      onClose();
    } catch (e: any) {
      setSaveError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const ownerName = kpi.owner_user
    ? `${kpi.owner_user.firstName} ${kpi.owner_user.lastName}`
    : kpi.owner;
  const colors = progressColor(kpi.progressPercent ?? 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: "edit", label: "Edit" },
    { key: "updates", label: "Updates" },
    { key: "stats", label: "Stats" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-800 truncate">{kpi.name}</h2>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                colors.text === "text-blue-600" ? "bg-blue-100 text-blue-600" :
                colors.text === "text-green-600" ? "bg-green-100 text-green-600" :
                colors.text === "text-yellow-600" ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-600"
              }`}>
                {(kpi.progressPercent ?? 0).toFixed(0)}% · {colors.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-gray-500">{ownerName}</span>
              <span className="text-gray-300">·</span>
              <span className="text-[11px] text-gray-500">{fiscalYearLabel(kpi.year)} {kpi.quarter}</span>
              <span className="text-gray-300">·</span>
              <span className="text-[11px] text-gray-500">{kpi.measurementUnit}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "edit" && (
            <EditTab form={editForm} setForm={setEditForm} errors={editErrors} users={users} />
          )}
          {tab === "updates" && (
            <UpdatesTab kpi={kpi} weeklyState={weeklyState} setWeeklyState={setWeeklyState} />
          )}
          {tab === "stats" && <StatsTab kpi={kpi} />}
        </div>

        {/* Footer – always Cancel + Save Changes */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {saveError
            ? <p className="text-xs text-red-500">{saveError}</p>
            : <div />
          }
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
