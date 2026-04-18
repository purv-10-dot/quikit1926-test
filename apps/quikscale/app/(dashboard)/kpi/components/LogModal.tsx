"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useUpdateKPI, useUpdateWeeklyValue, useNotes, useAddNote } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import type { KPIRow, WeeklyValue, User } from "@/lib/types/kpi";
import { fiscalYearLabel, weekDateLabel, ALL_WEEKS, MEASUREMENT_UNITS, ALL_QUARTERS } from "@/lib/utils/fiscal";
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { getColorByPercentage } from "@/lib/utils/colorLogic";
import { UserPicker } from "@quikit/ui";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import {
  buildBreakdown,
  redistributeOwnerRemainder,
  type DivisionType,
} from "./kpiModalHelpers";
import { WeekRow } from "./WeekRow";
import { StatsTab } from "./StatsTab";

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
  reverseColor: boolean;
};

// ── Edit Tab ──────────────────────────────────────────────────────────────────
// Pure formulas (buildBreakdown, redistributeOwnerRemainder) live in
// `./kpiModalHelpers`; this file owns only React glue code.

function EditTab({
  form, setForm, errors, users, isTeamKPI, kpiOwners,
}: {
  form: EditFormState;
  setForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  errors: Record<string, string>;
  users: User[];
  isTeamKPI?: boolean;
  kpiOwners?: Array<{ id: string; firstName: string; lastName: string }>;
}) {
  // Past-week lock for target breakdown editing
  const { canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(parseInt(form.year) || null, form.quarter);

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
      if (f.divisionType !== "Cumulative") {
        return { ...f, weeklyBreakdown: newBreakdown };
      }
      // `redistributeOwnerRemainder` preserves cells 1..w and re-splits
      // the remainder across w+1..13. Identical formula to KPIModal.
      return {
        ...f,
        weeklyBreakdown: redistributeOwnerRemainder(
          newBreakdown,
          w,
          actualNum(f),
          f.measurementUnit,
        ),
      };
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
          <label className="block text-xs font-medium text-gray-600 mb-1">KPI Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
          {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isTeamKPI ? "KPI Owner" : "Owner"} <span className="text-red-500">*</span>
          </label>
          {isTeamKPI && kpiOwners && kpiOwners.length > 0 ? (
            <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
              {kpiOwners.map(o => `${o.firstName} ${o.lastName}`).join(", ")}
            </div>
          ) : (
            <>
              <UserPicker value={form.owner} onChange={v => set("owner", v)} users={users} error={!!errors.owner} disabled />
              {errors.owner && <p className="text-[10px] text-red-500 mt-0.5">{errors.owner}</p>}
            </>
          )}
        </div>
      </div>

      {/* Quarter (read-only) */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
        <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
          {fiscalYearLabel(parseInt(form.year))} · {form.quarter}
        </div>
      </div>

      {/* Measurement Unit + Currency (read-only) */}
      <div className={`grid gap-3 ${isCurrency ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Measurement Unit</label>
          <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
            {form.measurementUnit}
          </div>
        </div>
        {isCurrency && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
            <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
              {CURRENCIES.find(c => c.code === form.currency)?.symbol} {form.currency}
            </div>
          </div>
        )}
      </div>

      {/* Target Value */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Target Value</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-1 focus-within:ring-accent-400 focus-within:border-accent-400">
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
                  onChange={() => set("status", s)} className="text-accent-600" />
                <span className="text-xs text-gray-600 capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Color Coding Mode */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Color Coding</label>
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
          <button type="button" onClick={() => setForm(f => ({ ...f, reverseColor: false }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              !form.reverseColor ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            Higher is Better
          </button>
          <button type="button" onClick={() => setForm(f => ({ ...f, reverseColor: true }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              form.reverseColor ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            Lower is Better
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          {form.reverseColor
            ? "Reverse mode — for defects, delays, errors (lower = better)"
            : "Forward mode — for sales, revenue, customers (higher = better)"}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
          rows={3} placeholder="Enter description…"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
      </div>

      {targetNum > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Target Breakdown (Weekly)</label>
          <div className="border border-gray-200 rounded-lg overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {ALL_WEEKS.map(w => {
                    const isPast = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                    return (
                    <th key={w} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 last:border-r-0 whitespace-nowrap ${isPast ? "text-gray-300" : "text-gray-500"}`}>
                      <div>{isPast ? "🔒 " : ""}W{w}</div>
                      <div className="text-[9px] font-normal text-gray-400">{weekDateLabel(parseInt(form.year), form.quarter, w)}</div>
                    </th>
                  );})}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {ALL_WEEKS.map(w => {
                    const isPast = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                    const isStandalone = form.divisionType === "Standalone";
                    const isLocked = isStandalone || isPast;
                    return (
                    <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                      <input
                        type="number"
                        min="0"
                        value={form.weeklyBreakdown[w] ?? ""}
                        onChange={e => setWeekBreakdown(w, e.target.value)}
                        readOnly={isLocked}
                        title={isPast ? "Past week editing is disabled. Enable in Settings > Configurations." : undefined}
                        className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none min-w-[72px] ${
                          isLocked
                            ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                        }`}
                      />
                    </td>
                  );})}
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


// ── Updates Tab ───────────────────────────────────────────────────────────────

function UpdatesTab({
  kpi,
  weeklyState,
  setWeeklyState,
  teamWeeklyState,
  setTeamWeeklyState,
  currentUserId,
  canEditAnyOwner,
}: {
  kpi: KPIRow;
  weeklyState: Record<number, { value: string; notes: string }>;
  setWeeklyState: React.Dispatch<React.SetStateAction<Record<number, { value: string; notes: string }>>>;
  teamWeeklyState: Record<string, Record<number, { value: string; notes: string }>>;
  setTeamWeeklyState: React.Dispatch<React.SetStateAction<Record<string, Record<number, { value: string; notes: string }>>>>;
  currentUserId: string;
  canEditAnyOwner: boolean;
}) {
  const { data: notesData, refetch: refetchNotes } = useNotes(kpi.id);
  const addNote = useAddNote(kpi.id);
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Past week lock
  const { canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(kpi.year, kpi.quarter);

  const weeklyTarget = (kpi.qtdGoal ?? kpi.target ?? 0) / 13;
  const isTeamKPI = kpi.kpiLevel === "team";
  const ownerList = (kpi.owners ?? []) as Array<{ id: string; firstName: string; lastName: string }>;
  const contribs = (kpi.ownerContributions as Record<string, number> | null | undefined) ?? {};

  function handleWeekChange(weekNumber: number, field: "value" | "notes", val: string) {
    setWeeklyState(s => ({
      ...s,
      [weekNumber]: { ...s[weekNumber], [field]: val },
    }));
  }

  function handleTeamWeekChange(ownerId: string, weekNumber: number, field: "value" | "notes", val: string) {
    setTeamWeeklyState(s => ({
      ...s,
      [ownerId]: {
        ...(s[ownerId] ?? {}),
        [weekNumber]: { ...(s[ownerId]?.[weekNumber] ?? { value: "", notes: "" }), [field]: val },
      },
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

        {isTeamKPI ? (
          // ── Team KPI: per-owner rows grouped by week ──
          // Each week is a section; per-owner rows show value + notes inputs.
          // Cells are editable only when the actor is admin/team head OR the row belongs to the actor.
          <div>
            <p className="text-[10px] text-gray-500 mb-2">
              Each owner enters their own weekly value.
              {canEditAnyOwner
                ? " As admin/team head, you can edit any owner's row."
                : " You can only edit your own row. Other owners' values are shown read-only."}
            </p>
            <div className="space-y-3">
              {ALL_WEEKS.map(w => {
                const locked = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                // Aggregate total for this week (display only)
                const total = ownerList.reduce((s, o) => {
                  const v = parseFloat(teamWeeklyState[o.id]?.[w]?.value ?? "") || 0;
                  return s + v;
                }, 0);
                return (
                  <div key={w} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Week {w}</span>
                        <span className="text-[10px] text-gray-400 ml-2">
                          {weekDateLabel(kpi.year, kpi.quarter, w)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500">
                        Total: <span className="font-semibold text-gray-700">{fmt(total)}</span>
                        {locked && <span className="ml-2 text-amber-600">· past-week locked</span>}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {ownerList.map(o => {
                        const full = `${o.firstName} ${o.lastName}`;
                        const pct = contribs[o.id] ?? 0;
                        const canEditThisRow = (canEditAnyOwner || o.id === currentUserId) && !locked;
                        const rowState = teamWeeklyState[o.id]?.[w] ?? { value: "", notes: "" };
                        const isSelf = o.id === currentUserId;
                        return (
                          <div key={o.id} className="flex items-center gap-2 px-3 py-1.5">
                            <div className="w-32 flex-shrink-0">
                              <div className="text-[11px] text-gray-700 truncate">
                                {full}
                                {isSelf && <span className="ml-1 text-[9px] text-accent-500">(you)</span>}
                              </div>
                              <div className="text-[9px] text-gray-400">{pct}%</div>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={rowState.value}
                              onChange={e => handleTeamWeekChange(o.id, w, "value", e.target.value)}
                              readOnly={!canEditThisRow}
                              placeholder="—"
                              className={`w-24 px-2 py-1 text-xs text-center border rounded focus:outline-none ${
                                canEditThisRow
                                  ? "border-gray-200 focus:ring-1 focus:ring-accent-400"
                                  : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                              }`}
                              title={!canEditThisRow
                                ? (locked ? "Past week locked" : "You can only edit your own row")
                                : undefined}
                            />
                            <input
                              type="text"
                              value={rowState.notes}
                              onChange={e => handleTeamWeekChange(o.id, w, "notes", e.target.value)}
                              readOnly={!canEditThisRow}
                              placeholder="Notes (optional)"
                              className={`flex-1 px-2 py-1 text-xs border rounded focus:outline-none ${
                                canEditThisRow
                                  ? "border-gray-200 focus:ring-1 focus:ring-accent-400"
                                  : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // ── Individual KPI: existing per-week rows (unchanged) ──
          <>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-24 text-[10px] text-gray-400 font-medium">Week</div>
              <div className="w-24 text-[10px] text-gray-400 font-medium text-center">Value</div>
              <div className="flex-1 text-[10px] text-gray-400 font-medium">Notes</div>
            </div>
            <div className="border border-gray-200 rounded-lg px-3 bg-white">
              {ALL_WEEKS.map(w => {
                const locked = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                return (
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
                  locked={locked}
                  reverse={kpi.reverseColor ?? false}
                />
              );})}
            </div>
          </>
        )}
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
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
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


// ── LogModal ──────────────────────────────────────────────────────────────────

export function LogModal({ kpi, onClose, onRefresh, initialTab = "updates" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: session } = useSession();
  const { data: users = [] } = useUsers();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isTeamKPI = kpi.kpiLevel === "team";
  const currentUserId = session?.user?.id ?? "";
  const sessionRole = (session?.user as { membershipRole?: string } | undefined)?.membershipRole;
  const isAdminActor =
    (sessionRole && (ROLE_HIERARCHY[sessionRole] ?? 0) >= ROLE_HIERARCHY[ROLES.ADMIN]) ||
    !!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const isTeamHeadActor = isTeamKPI && !!kpi.team?.headId && kpi.team.headId === currentUserId;
  // Shortcut used throughout: can the actor edit ANY owner's row?
  const canEditAnyOwner = isAdminActor || isTeamHeadActor;

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
      owner: kpi.owner ?? "",
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
      reverseColor: kpi.reverseColor ?? false,
    };
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Weekly values state for individual KPIs — one input per week.
  // For team KPIs this is still used to SHOW the aggregate (sum of owners) but not submitted.
  const [weeklyState, setWeeklyState] = useState<Record<number, { value: string; notes: string }>>(() => {
    const map: Record<number, { value: string; notes: string }> = {};
    for (let w = 1; w <= 13; w++) {
      const wv = (kpi.weeklyValues ?? []).find(x => x.weekNumber === w);
      map[w] = { value: wv?.value?.toString() ?? "", notes: wv?.notes ?? "" };
    }
    return map;
  });

  // Team KPI: per-owner per-week weekly state — { userId: { weekNumber: { value, notes } } }
  // Initialized from the API's weeklyOwnerValues map.
  const [teamWeeklyState, setTeamWeeklyState] = useState<Record<string, Record<number, { value: string; notes: string }>>>(() => {
    if (!isTeamKPI) return {};
    const out: Record<string, Record<number, { value: string; notes: string }>> = {};
    const ownerIds = (kpi.ownerIds ?? []) as string[];
    const byOwner = (kpi.weeklyOwnerValues ?? {}) as Record<string, WeeklyValue[]>;
    for (const ownerId of ownerIds) {
      const list = byOwner[ownerId] ?? [];
      const map: Record<number, { value: string; notes: string }> = {};
      for (let w = 1; w <= 13; w++) {
        const wv = list.find(x => x.weekNumber === w);
        map[w] = { value: wv?.value?.toString() ?? "", notes: wv?.notes ?? "" };
      }
      out[ownerId] = map;
    }
    return out;
  });

  async function handleSave() {
    // Validate edit form
    const errs: Record<string, string> = {};
    if (!editForm.name.trim()) errs.name = "Required";
    // Team KPIs use ownerIds (multi-select), not the single owner field
    if (!isTeamKPI && !editForm.owner) errs.owner = "Required";
    if (Object.keys(errs).length) {
      setEditErrors(errs);
      setTab("edit");
      return;
    }
    setEditErrors({});

    setSaving(true);
    setSaveError("");
    try {
      // Immutable fields (owner, quarter, year, measurementUnit, currency) are NOT sent on edit
      const kpiPayload = {
        name: editForm.name.trim(),
        description: editForm.description || undefined,
        teamId: editForm.teamId || undefined,
        parentKPIId: editForm.parentKPIId || undefined,
        target: editForm.target
          ? (parseFloat(editForm.target) || 0) * (editForm.measurementUnit === "Currency" ? getMultiplier(editForm.currency, editForm.targetScale) : 1)
          : undefined,
        quarterlyGoal: editForm.quarterlyGoal ? parseFloat(editForm.quarterlyGoal) : undefined,
        qtdGoal: editForm.qtdGoal ? parseFloat(editForm.qtdGoal) : undefined,
        status: editForm.status as "active" | "paused" | "completed",
        divisionType: editForm.divisionType,
        targetScale: editForm.measurementUnit === "Currency" ? editForm.targetScale : null,
        reverseColor: editForm.reverseColor,
        weeklyTargets: Object.fromEntries(
          Object.entries(editForm.weeklyBreakdown)
            .map(([k, v]) => [k, parseFloat(v) || 0])
        ),
      };

      // Save KPI metadata + weekly values in parallel.
      // For team KPIs, iterate (owner, week) pairs and include userId.
      // For individual KPIs, keep the per-week loop with no userId (server infers from kpi.owner).
      const weeklyPromises: Promise<any>[] = [];
      if (isTeamKPI) {
        for (const ownerId of Object.keys(teamWeeklyState)) {
          // Skip owners the actor can't edit (to avoid 403 responses that would roll back the batch)
          const canEditThisOwner = canEditAnyOwner || ownerId === currentUserId;
          if (!canEditThisOwner) continue;
          for (const w of ALL_WEEKS) {
            const { value, notes } = teamWeeklyState[ownerId]?.[w] ?? { value: "", notes: "" };
            weeklyPromises.push(
              updateWeekly.mutateAsync({
                weekNumber: w,
                value: value !== "" ? parseFloat(value) : null,
                notes: notes || null,
                userId: ownerId,
              })
            );
          }
        }
      } else {
        for (const w of ALL_WEEKS) {
          const { value, notes } = weeklyState[w] ?? { value: "", notes: "" };
          weeklyPromises.push(
            updateWeekly.mutateAsync({
              weekNumber: w,
              value: value !== "" ? parseFloat(value) : null,
              notes: notes || null,
            })
          );
        }
      }
      await Promise.all([updateKPI.mutateAsync(kpiPayload), ...weeklyPromises]);

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
                colors.text === "text-accent-600" ? "bg-accent-100 text-accent-600" :
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
            <EditTab form={editForm} setForm={setEditForm} errors={editErrors} users={users} isTeamKPI={isTeamKPI} kpiOwners={kpi.owners as Array<{ id: string; firstName: string; lastName: string }> | undefined} />
          )}
          {tab === "updates" && (
            <UpdatesTab
              kpi={kpi}
              weeklyState={weeklyState}
              setWeeklyState={setWeeklyState}
              teamWeeklyState={teamWeeklyState}
              setTeamWeeklyState={setTeamWeeklyState}
              currentUserId={currentUserId}
              canEditAnyOwner={canEditAnyOwner}
            />
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
