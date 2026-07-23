"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useUpdateKPI, useUpdateWeeklyValuesBatch, useNotes, useAddNote } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import { HistoryButton } from "@/components/audit/HistoryButton";
import type { KPIRow, WeeklyValue, User } from "@/lib/types/kpi";
import { fiscalYearLabel, weekDateLabel, weeksArray, MAX_WEEKS_PER_QUARTER, KPI_TYPES } from "@/lib/utils/fiscal";
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { UserPicker, DropdownPicker } from "@quikit/ui";
import { CURRENCIES, getScales, getMultiplier, formatActual, shortScaleLabel, scaleDownForDisplay, scaleUpFromInput } from "@/lib/utils/currency";
import { WeeklyScroller } from "./WeeklyScroller";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { weekEditState, isWeekInPast } from "@/lib/utils/weekLock";
import { UnitSelect } from "./UnitSelect";
import { useCurrentWeek, useWeekLabels, useQuarterWeekCount, useQuarterPosition } from "@/lib/hooks/useCurrentWeek";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { humanizeApiError } from "@/lib/utils/humanizeError";
import {
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  distributeContributionsEven,
  applyWeeklyEdit,
  sumBreakdown,
  checkBreakdownBalance,
  isTargetValueLocked,
  isStandaloneCellEditable,
  TARGET_LOCK_TIP,
} from "./kpiModalHelpers";
import { WeekRow } from "./WeekRow";
import { StatsTab } from "./StatsTab";
import { QuarterField } from "./QuarterField";
import { User as UserIcon, Calendar, CalendarDays } from "lucide-react";

interface Props {
  kpi: KPIRow;
  onClose: () => void;
  onRefresh: () => void;
  initialTab?: Tab;
  /** RBAC v2: false makes the entire drawer read-only — every input is
   *  disabled and Save Changes is hidden. Defaults to true. */
  canUpdate?: boolean;
  /** Opens the Change History drawer for this KPI (AC-1.1). */
  onOpenHistory?: () => void;
}

type Tab = "edit" | "updates" | "stats";


type EditFormState = {
  name: string; description: string; owner: string; teamId: string;
  parentKPIId: string; quarter: string; year: string; measurementUnit: string;
  target: string; quarterlyGoal: string; qtdGoal: string; status: string;
  divisionType: "Cumulative" | "Standalone";
  weeklyBreakdown: Record<number, string>;
  currency: string;
  targetScale: string;
  unit: string;
  scaledDisplay: boolean;
  reverseColor: boolean;
  kpiType: "NA" | "Leading" | "Lagging";
  // Team-KPI multi-owner state (mirrors KPIModal's create form so the Edit
  // dialog can show Contribution % per Owner + per-owner Target Breakdown rows).
  ownerIds: string[];
  ownerContributions: Record<string, string>;
  weeklyOwnerBreakdown: Record<string, Record<number, string>>;
  // Per-owner Individual KPI name override. Seeded from each child's current
  // name on mount; sent on save so renames propagate to the linked children.
  ownerKpiNames: Record<string, string>;
};

// ── Edit Tab ──────────────────────────────────────────────────────────────────
// Pure formulas (buildBreakdown, redistributeOwnerRemainder) live in
// `./kpiModalHelpers`; this file owns only React glue code.

function EditTab({
  form, setForm, errors, users, isTeamKPI, kpiOwners, readOnly,
}: {
  form: EditFormState;
  setForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  errors: Record<string, string>;
  users: User[];
  isTeamKPI?: boolean;
  kpiOwners?: Array<{ id: string; firstName: string; lastName: string }>;
  readOnly?: boolean;
}) {
  // Past-week lock for the Target Breakdown (weekly *targets*).
  // Bound to the "Add Past Week Data" toggle (canAddPastWeek) — NOT
  // "Edit Past Week Data" (which governs the Updates tab's weekly *values*).
  // Uses DB-driven useCurrentWeek so the week number honours the tenant's
  // configured QuarterSetting.startDate (may be offset from the hardcoded
  // Apr 1/Jul 1/Oct 1/Jan 1 map).
  const { canAddPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  // Editing the Target Value redistributes the weekly breakdown across ALL
  // weeks (incl. past). When "Add Past Week Data" is off those cells are locked,
  // so the Target Value is locked too. EditTab is always an edit context.
  const targetLocked = isTargetValueLocked({ isEditMode: true, flagsLoaded, canAddPastWeek });
  // A week is locked-by-past when state has resolved, the week is in the past
  // (quarter/year-aware — a fully-past quarter counts ALL its weeks as past, not
  // just those below the clamped current week), AND the org disallows adding
  // past-week data. Hard binary (no "current week − 1" grace — that grace lives
  // only on the Updates tab); future quarters stay editable for target planning.
  const editQuarterPos = useQuarterPosition(parseInt(form.year) || null, form.quarter);
  const isEditWeekPast = (w: number): boolean =>
    isWeekInPast(editQuarterPos ?? "current", w, currentWeek);
  const weekLockedByPast = (w: number): boolean =>
    flagsLoaded && editQuarterPos !== null && isEditWeekPast(w) && !canAddPastWeek;
  // Standalone renders current & future weeks as editable 0/target dropdowns
  // always; past weeks become editable only when "Add Past Week Data" is ON.
  // Shared per-week gate with the create form (KPIModal) via
  // isStandaloneCellEditable. See that helper for the rationale.
  const pastWeekAllowed = flagsLoaded && canAddPastWeek;
  const currentWeek = useCurrentWeek(parseInt(form.year) || null, form.quarter);
  const editTabWeekLabels = useWeekLabels(parseInt(form.year) || null, form.quarter);
  const weekCount = useQuarterWeekCount(parseInt(form.year) || null, form.quarter);
  // In past-week mode a fully-PAST selected quarter has every week open for
  // retroactive planning, so distribute from week 1 rather than the clamped
  // last week. Current/future quarters keep the existing behaviour.
  const firstEditableWeek = (pastWeekAllowed && editQuarterPos === "past")
    ? 1
    : ((currentWeek !== null && currentWeek > 1) ? currentWeek : 1);
  // Buffers the in-progress keystrokes of a scaled breakdown cell so decimals
  // (e.g. "2.5") aren't mangled by the raw↔unit round-trip mid-type.
  const [editingCell, setEditingCell] = useState<{ key: string; raw: string } | null>(null);

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  /** Change the KPI's quarter (only reachable when "Add Past Week Data" is on). */
  function setQuarter(q: string) {
    quarterTouchedRef.current = true;
    setForm(f => ({ ...f, quarter: q }));
  }

  // Rebuild the weekly breakdown for the NEW quarter once its async-resolved
  // `firstEditableWeek` + `weekCount` settle. Only fires after a user-initiated
  // quarter switch (mirrors KPIModal). Standalone/Cumulative both re-derive from
  // formula since the saved breakdown belonged to the previous quarter.
  const quarterTouchedRef = useRef(false);
  useEffect(() => {
    if (!quarterTouchedRef.current) return;
    setForm(f => {
      const tNum = f.measurementUnit === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      if (tNum <= 0) return f;
      const next = {
        ...f,
        weeklyBreakdown: buildBreakdown(f.divisionType, tNum, f.measurementUnit, firstEditableWeek, weekCount),
      };
      if (isTeamKPI) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.quarter, firstEditableWeek, weekCount]);

  /** Compute the actual (scaled) target from display value + scale */
  function actualNum(f: EditFormState): number {
    const base = parseFloat(f.target) || 0;
    if (f.measurementUnit !== "Currency") return base;
    return base * getMultiplier(f.currency, f.targetScale);
  }

  function setTargetScale(val: string) {
    setForm(f => {
      const n = (parseFloat(f.target) || 0) * getMultiplier(f.currency, val);
      return { ...f, targetScale: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek, weekCount) };
    });
  }

  function setDivisionType(dt: "Cumulative" | "Standalone") {
    setForm(f => ({ ...f, divisionType: dt, weeklyBreakdown: buildBreakdown(dt, actualNum(f), f.measurementUnit, firstEditableWeek, weekCount) }));
  }

  function setTarget(val: string) {
    setForm(f => {
      const n = f.measurementUnit === "Currency"
        ? (parseFloat(val) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(val) || 0;
      return { ...f, target: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek, weekCount) };
    });
  }

  function setWeekBreakdown(w: number, val: string) {
    // Mirror the create form (KPIModal.setWeekBreakdown). `applyWeeklyEdit`
    // redistributes the remainder across w+1..lastWeek for Cumulative;
    // Standalone sets the one cell. `actualNum` applies the currency scale.
    // clampToTarget=false → an over-target entry stays as typed so the balance
    // indicator WARNS instead of silently capping it.
    setForm(f => ({
      ...f,
      weeklyBreakdown: applyWeeklyEdit(
        f.weeklyBreakdown,
        w,
        val,
        actualNum(f),
        f.measurementUnit,
        f.divisionType,
        weekCount,
        false,
      ),
    }));
  }

  // ── Team-KPI helpers (mirror KPIModal) ──
  function computeAllOwnerBreakdowns(f: EditFormState): Record<string, Record<number, string>> {
    const tNum = f.measurementUnit === "Currency"
      ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
      : parseFloat(f.target) || 0;
    const out: Record<string, Record<number, string>> = {};
    for (const id of f.ownerIds) {
      const pct = parseFloat(f.ownerContributions[id]) || 0;
      out[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek, weekCount);
    }
    return out;
  }

  function setContribution(id: string, val: string) {
    setForm(f => {
      const newContribs = { ...f.ownerContributions, [id]: val };
      const newOwnerBreakdown = computeAllOwnerBreakdowns({ ...f, ownerContributions: newContribs });
      return { ...f, ownerContributions: newContribs, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
  }

  function distributeContributionsEvenly() {
    setForm(f => {
      if (f.ownerIds.length === 0) return f;
      const newContribs = distributeContributionsEven(f.ownerIds);
      const newOwnerBreakdown = computeAllOwnerBreakdowns({ ...f, ownerContributions: newContribs });
      return { ...f, ownerContributions: newContribs, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
  }

  function setOwnerWeekCell(ownerId: string, weekNumber: number, rawVal: string) {
    setForm(f => {
      const totalTargetNum = actualNum(f);
      const pct = parseFloat(f.ownerContributions[ownerId]) || 0;
      const ownerSubTarget = totalTargetNum * (pct / 100);
      const isWhole = f.measurementUnit === "Number";
      const existingRow = f.weeklyOwnerBreakdown[ownerId] ?? {};

      // No upper clamp — an over-sub-target entry stays as typed so the balance
      // indicator can WARN; redistribution still handles the later weeks.
      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;

      const val = rawVal === "" ? "" : (isWhole ? String(Math.round(parsed)) : parsed.toFixed(2));
      let ownerRow = { ...existingRow, [weekNumber]: val };
      if (f.divisionType === "Cumulative") {
        ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit);
      }
      return { ...f, weeklyOwnerBreakdown: { ...f.weeklyOwnerBreakdown, [ownerId]: ownerRow } };
    });
  }

  function setTeamTotalWeekCell(weekNumber: number, rawVal: string) {
    setForm(f => {
      const totalTargetNum = actualNum(f);
      const isWhole = f.measurementUnit === "Number";

      // No upper clamp — an over-target total stays as typed so the balance
      // indicator can WARN; per-owner redistribution handles the rest.
      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;

      const totalNum = parsed;
      const newOwnerBreakdown: Record<string, Record<number, string>> = { ...f.weeklyOwnerBreakdown };
      for (const id of f.ownerIds) {
        const pct = parseFloat(f.ownerContributions[id]) || 0;
        const ownerCellVal = totalNum * (pct / 100);
        const formattedVal = isWhole ? String(Math.round(ownerCellVal)) : ownerCellVal.toFixed(2);
        let ownerRow = { ...(newOwnerBreakdown[id] ?? {}), [weekNumber]: formattedVal };
        if (f.divisionType === "Cumulative") {
          const ownerSubTarget = totalTargetNum * (pct / 100);
          ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit);
        }
        newOwnerBreakdown[id] = ownerRow;
      }
      return { ...f, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
  }

  // Auto-seed empty per-owner rows on first render (handles legacy KPIs that
  // were saved before `weeklyOwnerTargets` existed). Intentionally fires only
  // when isTeamKPI flips — re-running on every computeAllOwnerBreakdowns /
  // setForm change would create an infinite loop with the setForm inside.
  useEffect(() => {
    if (!isTeamKPI) return;
    setForm(f => {
      const needsSeed = f.ownerIds.some(id => !f.weeklyOwnerBreakdown[id] || Object.keys(f.weeklyOwnerBreakdown[id]).length === 0);
      if (!needsSeed) return f;
      return { ...f, weeklyOwnerBreakdown: computeAllOwnerBreakdowns(f) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeamKPI]);

  const contributionSum = Object.values(form.ownerContributions).reduce(
    (s, v) => s + (parseFloat(v) || 0), 0
  );
  const contributionSumValid = Math.abs(contributionSum - 100) <= 0.5 && form.ownerIds.length > 0;

  const isCurrency = form.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find(c => c.code === form.currency) ?? CURRENCIES[0];
  const scales = getScales(form.currency);
  const scaledTarget = isCurrency
    ? (parseFloat(form.target) || 0) * getMultiplier(form.currency, form.targetScale)
    : parseFloat(form.target) || 0;
  const targetNum = scaledTarget;
  // Show the weekly Target-Breakdown grid whenever a valid non-negative target
  // is entered — including exactly 0 (a zero goal spreads 0 across every week).
  const showBreakdown = form.target.trim() !== "" && !isNaN(parseFloat(form.target)) && scaledTarget >= 0;

  // Scaled-display: breakdown cells show/accept the scale unit when the toggle
  // is on; form.weeklyBreakdown stays RAW. Passthrough otherwise.
  const breakdownScaleMult = isCurrency && form.scaledDisplay ? getMultiplier(form.currency, form.targetScale) : 1;
  const toDisp = (raw: number | string) =>
    breakdownScaleMult > 1
      ? scaleDownForDisplay(raw, form.currency, form.targetScale)
      : (typeof raw === "string" ? raw : String(raw));
  const toRaw = (input: string) =>
    breakdownScaleMult > 1 ? scaleUpFromInput(input, form.currency, form.targetScale) : input;
  // Number KPI unit-of-measure (from Unit Master, e.g. "lb"). Shown as a plain
  // suffix — Number values are NOT scaled, so no prefix / no value conversion.
  const numberUnit = form.measurementUnit === "Number" ? (form.unit || "") : "";
  // Cell suffix: currency scale unit when scaled, else the Number unit.
  const breakdownUnit = breakdownScaleMult > 1 ? shortScaleLabel(form.targetScale) : numberUnit;
  // Currency symbol prefix shown on each scaled breakdown cell (₹2, $9, …).
  // Currency-scaled only — Number unit cells carry no prefix.
  const breakdownPrefix = breakdownScaleMult > 1 ? currencyObj.symbol : "";
  // Scaled currency cells hold small numbers (e.g. "100") but a wide unit suffix
  // ("100 Cr"), so shrink the INPUT to leave room. Number cells keep full width
  // (raw values can be large) — gate on the currency scale, not the suffix.
  const cellMinW = breakdownScaleMult > 1 ? "min-w-[48px]" : "min-w-[72px]";
  // Full raw rupee value behind a SCALED currency cell, en-IN formatted (tooltip).
  const rawTip = (raw: number | string): string | undefined => {
    if (breakdownScaleMult <= 1) return undefined;
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (!Number.isFinite(n)) return undefined;
    return `= ${formatActual(n, currencyObj.symbol, form.currency)}`;
  };

  // Breakdown balance (Cumulative only) — the weekly cells must total the target.
  // Team sums every owner cell; individual sums the single row. Drives the live
  // "Remaining" indicator below the breakdown. `scaledTarget` is the raw target.
  const balanceSum = isTeamKPI && form.ownerIds.length > 0
    ? form.ownerIds.reduce((s, id) => s + sumBreakdown(form.weeklyOwnerBreakdown[id] ?? {}), 0)
    : sumBreakdown(form.weeklyBreakdown);
  const balance = form.divisionType === "Cumulative"
    ? checkBreakdownBalance(balanceSum, scaledTarget)
    : null;

  return (
    <div className="space-y-4">
      {errors._ && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._}</div>
      )}

      {/* Legacy instance-level banner removed per product spec. The RBAC v2
          banner (rendered at the LogModal root when !canUpdate) covers the
          only case where the form is now read-only. */}

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

      {/* Quarter (editable dropdown when "Add Past Week Data" is on) */}
      <div>
        <QuarterField
          year={parseInt(form.year)}
          quarter={form.quarter}
          editable={pastWeekAllowed}
          onChange={setQuarter}
        />
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

      {/* KPI Type — Leading (predictive input) vs Lagging (outcome); NA = unset. */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            KPI Type
          </label>
          <DropdownPicker
            value={form.kpiType}
            onChange={(v) => set("kpiType", v)}
            options={KPI_TYPES.map(t => ({ value: t, label: t }))}
            disabled={readOnly}
          />
          {errors.kpiType && <p className="text-[10px] text-red-500 mt-0.5">{errors.kpiType}</p>}
        </div>
      </div>

      {/* Target Value */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Target Value</label>
        <div className={`flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-1 focus-within:ring-accent-400 focus-within:border-accent-400 ${targetLocked ? "bg-gray-50" : ""}`}>
          {isCurrency && (
            <span className="flex items-center px-2.5 bg-gray-50 border-r border-gray-200 text-xs text-gray-500 select-none whitespace-nowrap flex-shrink-0">
              {currencyObj.symbol}
            </span>
          )}
          <input type="number" min="0" value={form.target} onChange={e => setTarget(e.target.value)}
            readOnly={readOnly || targetLocked}
            title={targetLocked ? TARGET_LOCK_TIP : undefined}
            placeholder="0"
            className={`flex-1 px-3 py-2 text-xs focus:outline-none min-w-0 ${targetLocked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"}`} />
          {isCurrency && (
            <select value={form.targetScale} onChange={e => setTargetScale(e.target.value)}
              disabled={readOnly || targetLocked}
              className={`border-l border-gray-200 pl-2 pr-1 py-2 text-xs focus:outline-none text-gray-600 flex-shrink-0 ${targetLocked ? "bg-gray-50 cursor-not-allowed" : "bg-white cursor-pointer"}`}>
              {scales.map(s => (
                <option key={s.label} value={s.label}>{s.label || "—"}</option>
              ))}
            </select>
          )}
          {/* Number KPIs: unit-of-measurement dropdown (from Unit Master). */}
          {form.measurementUnit === "Number" && (
            <UnitSelect value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))} disabled={readOnly || targetLocked} />
          )}
        </div>
        {targetLocked && (
          <p className="text-[10px] text-amber-600 mt-1">{TARGET_LOCK_TIP}</p>
        )}
        {isCurrency && form.targetScale && scaledTarget > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            = {formatActual(scaledTarget, currencyObj.symbol, form.currency)}
          </p>
        )}
      </div>

      {/* Division Type + scaled-display toggle share one row. */}
      <div className="flex flex-wrap gap-6 items-start">
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
          {form.divisionType === "Cumulative" ? `Target split equally across ${weekCount} weeks` : "Each week carries the full target value"}
        </p>
      </div>

      {/* Scaled display toggle — Currency KPI with a chosen scale only. */}
      {isCurrency && !!form.targetScale && (
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-gray-600 mb-1">Show values in {form.targetScale}</label>
          <button
            type="button"
            role="switch"
            aria-checked={form.scaledDisplay}
            disabled={readOnly}
            onClick={() => setForm(f => ({ ...f, scaledDisplay: !f.scaledDisplay }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${form.scaledDisplay ? "bg-accent-600" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.scaledDisplay ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <p className="text-[10px] text-gray-400 mt-1">
            {form.scaledDisplay
              ? `Weekly breakdown, Updates & Stats show in ${shortScaleLabel(form.targetScale)} (${currencyObj.symbol} ${form.targetScale}). Stored values stay exact.`
              : `Off — full numbers (e.g. ${currencyObj.symbol}25,000,000).`}
          </p>
        </div>
      )}
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

      {/* Contribution % per Owner — Team KPI only. Mirrors KPIModal. */}
      {isTeamKPI && form.ownerIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">
              Contribution % per Owner <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={distributeContributionsEvenly}
              className="text-[10px] text-accent-500 hover:text-accent-700 hover:underline font-medium"
            >
              Distribute evenly
            </button>
          </div>
          <div className="border rounded-lg divide-y overflow-hidden border-gray-200">
            {form.ownerIds.map(id => {
              const u = (kpiOwners ?? users).find(u => u.id === id);
              if (!u) return null;
              const pctStr = form.ownerContributions[id] ?? "";
              const pct = parseFloat(pctStr) || 0;
              const contributionValue = scaledTarget * (pct / 100);
              const nameOverride = form.ownerKpiNames[id] ?? "";
              return (
                <div key={id} className="flex flex-col gap-1.5 px-3 py-2 bg-white hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-700 flex-1 truncate">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="text-[10px] text-gray-400 whitespace-nowrap">
                      Contribution value: <span className="text-gray-600 font-medium">
                        {scaledTarget > 0
                          ? (form.measurementUnit === "Number" ? Math.round(contributionValue) : contributionValue.toFixed(2))
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={pctStr}
                        onChange={e => setContribution(id, e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                  {/* Individual KPI name — pre-filled from the linked child KPI's
                      current name. Editing it renames the child on Save. */}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-400 whitespace-nowrap">Individual KPI name</label>
                    <input
                      type="text"
                      value={nameOverride}
                      onChange={e => setForm(f => ({
                        ...f,
                        ownerKpiNames: { ...f.ownerKpiNames, [id]: e.target.value },
                      }))}
                      placeholder={form.name || "Defaults to Team KPI name"}
                      className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                    />
                  </div>
                </div>
              );
            })}
            <div className={`flex items-center justify-between px-3 py-1.5 text-[10px] font-medium ${
              contributionSumValid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}>
              <span>Total</span>
              <span>{contributionSum.toFixed(1)}% {contributionSumValid ? "✓" : "(must equal 100%)"}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
          rows={3} placeholder="Enter description…"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
      </div>

      {showBreakdown && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Target Breakdown (Weekly)
            {breakdownScaleMult > 1
              ? ` — in ${currencyObj.symbol} ${breakdownUnit}`
              : breakdownUnit ? ` — in ${breakdownUnit}` : ""}
            {breakdownScaleMult > 1 && (
              <span className="ml-2 font-normal text-gray-400">
                = {formatActual(scaledTarget, currencyObj.symbol, form.currency)} total
              </span>
            )}
          </label>
          <WeeklyScroller>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {isTeamKPI && form.ownerIds.length > 0 && (
                    <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left min-w-[140px]">
                      &nbsp;
                    </th>
                  )}
                  {weeksArray(weekCount).map(w => {
                    const isStandaloneEditable = isStandaloneCellEditable(form.divisionType, isEditWeekPast(w), pastWeekAllowed);
                    const showLock = weekLockedByPast(w) && !isStandaloneEditable;
                    return (
                    <th key={w} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 last:border-r-0 whitespace-nowrap ${showLock ? "text-gray-300" : "text-gray-500"}`}>
                      <div>{showLock ? "🔒 " : ""}W{w}</div>
                      <div className="text-[9px] font-normal text-gray-400">{editTabWeekLabels[w - 1] ?? weekDateLabel(parseInt(form.year), form.quarter, w)}</div>
                    </th>
                  );})}
                </tr>
              </thead>
              <tbody>
                {/* Total row */}
                <tr>
                  {isTeamKPI && form.ownerIds.length > 0 && (
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Total
                    </td>
                  )}
                  {weeksArray(weekCount).map(w => {
                    const isStandalone = form.divisionType === "Standalone";
                    // Individual row: Standalone current & future weeks are ALWAYS an
                    // editable 0/target dropdown; past weeks require "Add Past Week Data".
                    // The Team total row is a read-only SUM of the per-owner cells below
                    // (those rows are the source of truth), so it never renders a dropdown.
                    const isStandaloneDropdown = !isTeamKPI
                      && isStandaloneCellEditable(form.divisionType, isEditWeekPast(w), pastWeekAllowed);
                    const standaloneCellEditable = isStandaloneDropdown;
                    const isLocked = isStandalone ? !standaloneCellEditable : weekLockedByPast(w);

                    // Team mode: total = live sum of per-owner cells, edit redistributes by contribution %.
                    if (isTeamKPI && form.ownerIds.length > 0) {
                      const sum = form.ownerIds.reduce((s, id) => {
                        const v = parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0;
                        return s + v;
                      }, 0);
                      const displaySum = form.measurementUnit === "Number"
                        ? Math.round(sum).toString()
                        : sum.toFixed(2);
                      return (
                        <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0 bg-gray-50">
                          <div className="flex items-center gap-0.5">
                            {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                            <input
                              type="number"
                              min="0"
                              value={editingCell?.key === `tot-${w}` ? editingCell.raw : toDisp(displaySum)}
                              onChange={e => { setEditingCell({ key: `tot-${w}`, raw: e.target.value }); setTeamTotalWeekCell(w, toRaw(e.target.value)); }}
                              onBlur={() => setEditingCell(null)}
                              readOnly={isLocked}
                              title={weekLockedByPast(w)
                                ? "Past week targets are locked. Enable “Add Past Week Data” in Settings > Configurations."
                                : "Editing the total redistributes across owners by contribution %"}
                              className={`w-full px-1 py-1 text-center text-xs font-semibold border rounded focus:outline-none ${cellMinW} ${
                                isLocked
                                  ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                  : "border-gray-200 bg-white text-gray-800 focus:ring-1 focus:ring-accent-400"
                              }`}
                            />
                            {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                          </div>
                        </td>
                      );
                    }

                    if (isStandaloneDropdown) {
                      const isNumUnit = form.measurementUnit === "Number";
                      const zeroStr = isNumUnit ? "0" : "0.00";
                      const targetStr = scaledTarget > 0
                        ? (isNumUnit ? String(Math.round(scaledTarget)) : scaledTarget.toFixed(2))
                        : "";
                      const current = form.weeklyBreakdown[w] ?? "";
                      const currentNum = parseFloat(current) || 0;
                      const norm = (currentNum === 0 || current === "") ? zeroStr
                        : (targetStr && Math.abs(currentNum - scaledTarget) < 0.001) ? targetStr
                        : current;
                      return (
                        <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                          <div className="flex items-center gap-0.5">
                            {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                            <select
                              value={norm}
                              onChange={e => setWeekBreakdown(w, e.target.value)}
                              title={rawTip(form.weeklyBreakdown[w] ?? "")}
                              className={`w-full px-1 py-1 text-center text-xs border rounded border-gray-200 focus:outline-none focus:ring-1 focus:ring-accent-400 ${cellMinW}`}
                            >
                              <option value={zeroStr}>0</option>
                              {targetStr && <option value={targetStr}>{toDisp(targetStr)}</option>}
                              {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                                <option value={norm}>{toDisp(norm)} (custom)</option>
                              )}
                            </select>
                            {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                          </div>
                        </td>
                      );
                    }

                    return (
                    <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                      <div className="flex items-center gap-0.5">
                        {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                        <input
                          type="number"
                          min="0"
                          value={editingCell?.key === `ind-${w}` ? editingCell.raw : toDisp(form.weeklyBreakdown[w] ?? "")}
                          onChange={e => { setEditingCell({ key: `ind-${w}`, raw: e.target.value }); setWeekBreakdown(w, toRaw(e.target.value)); }}
                          onBlur={() => setEditingCell(null)}
                          readOnly={isLocked}
                          title={weekLockedByPast(w) ? "Past week targets are locked. Enable “Add Past Week Data” in Settings > Configurations." : rawTip(form.weeklyBreakdown[w] ?? "")}
                          className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none ${cellMinW} ${
                            isLocked
                              ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                              : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                          }`}
                        />
                        {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                      </div>
                    </td>
                  );})}
                </tr>

                {/* Per-owner rows — Team KPI only. Editable; total above derives from sum. */}
                {isTeamKPI && form.ownerIds.map(id => {
                  const u = (kpiOwners ?? users).find(u => u.id === id);
                  if (!u) return null;
                  const pct = parseFloat(form.ownerContributions[id]) || 0;
                  const ownerRow = form.weeklyOwnerBreakdown[id] ?? {};
                  return (
                    <tr key={id} className="bg-gray-50/60">
                      <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 border-r border-t border-gray-200 text-[10px] text-gray-600 whitespace-nowrap truncate max-w-[140px]">
                        {u.firstName} {u.lastName}
                        <span className="ml-1 text-gray-400">({pct.toFixed(0)}%)</span>
                      </td>
                      {weeksArray(weekCount).map(w => {
                        const isStandalone = form.divisionType === "Standalone";
                        // Standalone per-owner: current & future weeks are ALWAYS an
                        // editable 0/sub-target dropdown; past weeks become editable
                        // only when "Add Past Week Data" is ON (else locked). Mirrors
                        // the create form (KPIModal). Cumulative keeps the numeric input.
                        if (isStandaloneCellEditable(form.divisionType, isEditWeekPast(w), pastWeekAllowed)) {
                          const isNumUnit = form.measurementUnit === "Number";
                          const ownerTarget = (pct / 100) * scaledTarget;
                          const zeroStr = isNumUnit ? "0" : "0.00";
                          const targetStr = ownerTarget > 0
                            ? (isNumUnit ? String(Math.round(ownerTarget)) : ownerTarget.toFixed(2))
                            : "";
                          const current = ownerRow[w] ?? "";
                          const currentNum = parseFloat(current) || 0;
                          const norm = (currentNum === 0 || current === "") ? zeroStr
                            : (targetStr && Math.abs(currentNum - ownerTarget) < 0.001) ? targetStr
                            : current;
                          return (
                            <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                              <div className="flex items-center gap-0.5">
                                {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                                <select
                                  value={norm}
                                  onChange={e => setOwnerWeekCell(id, w, e.target.value)}
                                  title={rawTip(ownerRow[w] ?? "")}
                                  className={`w-full px-1 py-1 text-center text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${cellMinW} cursor-pointer`}
                                >
                                  <option value={zeroStr}>0</option>
                                  {targetStr && <option value={targetStr}>{toDisp(targetStr)}</option>}
                                  {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                                    <option value={norm}>{toDisp(norm)} (custom)</option>
                                  )}
                                </select>
                                {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                              </div>
                            </td>
                          );
                        }
                        const isLocked = isStandalone || weekLockedByPast(w);
                        return (
                          <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                            <div className="flex items-center gap-0.5">
                              {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                              <input
                                type="number"
                                min="0"
                                value={editingCell?.key === `own-${id}-${w}` ? editingCell.raw : toDisp(ownerRow[w] ?? "")}
                                onChange={e => { setEditingCell({ key: `own-${id}-${w}`, raw: e.target.value }); setOwnerWeekCell(id, w, toRaw(e.target.value)); }}
                                onBlur={() => setEditingCell(null)}
                                readOnly={isLocked}
                                title={weekLockedByPast(w)
                                  ? "Past week targets are locked. Enable “Add Past Week Data” in Settings > Configurations."
                                  : isStandalone ? "Standalone mode locks per-owner cells" : rawTip(ownerRow[w] ?? "")}
                                className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none ${cellMinW} ${
                                  isLocked
                                    ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                    : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                                }`}
                              />
                              {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WeeklyScroller>
          <p className="text-[10px] text-gray-400 mt-1">
            {form.divisionType === "Cumulative"
              ? `Remainder distributed right-to-left — edit cells to override`
              : `Each week = full target${isCurrency ? ` (${currencyObj.symbol}${targetNum})` : ` (${targetNum})`}`}
          </p>
          {/* Live balance indicator — the weekly cells must total the target
              (Cumulative only). Shows the shortfall/overage in red. */}
          {balance && balance.status !== "balanced" && (
            <p className="text-[11px] font-medium text-red-600 mt-1.5">
              {balance.status === "under"
                ? `Remaining: ${toDisp(String(balance.remaining))}${breakdownUnit ? ` ${breakdownUnit}` : ""} — weekly targets must total the ${toDisp(String(scaledTarget))}${breakdownUnit ? ` ${breakdownUnit}` : ""} target.`
                : `Over target by ${toDisp(String(Math.abs(balance.remaining)))}${breakdownUnit ? ` ${breakdownUnit}` : ""} — reduce the weekly targets to total the target.`}
            </p>
          )}
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
  liveFormTarget,
  liveWeeklyTargets,
}: {
  kpi: KPIRow;
  weeklyState: Record<number, { value: string; notes: string }>;
  setWeeklyState: React.Dispatch<React.SetStateAction<Record<number, { value: string; notes: string }>>>;
  teamWeeklyState: Record<string, Record<number, { value: string; notes: string }>>;
  setTeamWeeklyState: React.Dispatch<React.SetStateAction<Record<string, Record<number, { value: string; notes: string }>>>>;
  currentUserId: string;
  canEditAnyOwner: boolean;
  /** Live target number from editForm (before save). Overrides kpi.qtdGoal for display. */
  liveFormTarget?: number | null;
  /** Live per-week target map from editForm.weeklyBreakdown (before save). */
  liveWeeklyTargets?: Record<string, number>;
}) {
  const { data: notesData, refetch: refetchNotes } = useNotes(kpi.id);
  const addNote = useAddNote(kpi.id);
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Past week lock. DB-driven: respects tenant's QuarterSetting.startDate.
  // `flagsLoaded` gates the lock so past weeks stay locked until the flag +
  // current-week state resolve (see weeklyInputLockState).
  const { canEditPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(kpi.year, kpi.quarter);
  // Quarter/year position so a past KPI's last week and a future KPI's first
  // week are locked correctly (the clamped `currentWeek` can't tell them apart).
  const updatesQuarterPos = useQuarterPosition(kpi.year, kpi.quarter);
  const updatesGateLoaded = flagsLoaded && updatesQuarterPos !== null;
  const updatesTabWeekLabels = useWeekLabels(kpi.year, kpi.quarter);
  const weekCount = useQuarterWeekCount(kpi.year, kpi.quarter);

  // Use live form target when available so the header and per-week targets
  // reflect editForm changes immediately (before save).
  const weeklyTarget = (liveFormTarget ?? kpi.qtdGoal ?? kpi.target ?? 0) / weekCount;
  const isTeamKPI = kpi.kpiLevel === "team";
  const ownerList = (kpi.owners ?? []) as Array<{ id: string; firstName: string; lastName: string }>;
  const contribs = (kpi.ownerContributions as Record<string, number> | null | undefined) ?? {};
  // Prefer live breakdown (from editForm) over DB snapshot so the per-week
  // target display updates before the user hits Save.
  const savedWeeklyTargets: Record<string, number> | null =
    liveWeeklyTargets ?? (kpi.weeklyTargets as Record<string, number> | null | undefined) ?? null;
  const targetForWeek = (w: number): number =>
    savedWeeklyTargets?.[String(w)] ?? weeklyTarget;

  // A zero-target KPI (whole-KPI target of 0, e.g. "zero defects") is a valid,
  // trackable KPI: every week's target is 0. Unlike a single 0-target week
  // inside a positive KPI (which stays locked), its weeks must be editable and
  // display "0" rather than "—" / "No target set". Distinguish by the KPI-level
  // target, not the per-week value.
  const isZeroTargetKPI = (liveFormTarget ?? kpi.qtdGoal ?? kpi.target ?? 0) === 0;

  // Scaled-display for the Updates tab. Weekly target + actual are stored RAW;
  // when the KPI's toggle is on they're shown + typed in the scale unit (e.g.
  // Cr). Passthrough otherwise. `valBuf` preserves in-progress decimals.
  const scaleMultU =
    kpi.measurementUnit === "Currency" && kpi.scaledDisplay
      ? getMultiplier(kpi.currency ?? "", kpi.targetScale ?? "")
      : 1;
  // Number KPI unit-of-measure (from Unit Master) for the Updates tab.
  const numberUnitU = kpi.measurementUnit === "Number" ? (kpi.unit ?? "") : "";
  const unitU = scaleMultU > 1 ? shortScaleLabel(kpi.targetScale) : numberUnitU;
  const curSymU = CURRENCIES.find(c => c.code === kpi.currency)?.symbol ?? "";
  const toDispU = (raw: number | string) =>
    scaleMultU > 1 ? scaleDownForDisplay(raw, kpi.currency ?? "", kpi.targetScale ?? "") : (typeof raw === "string" ? raw : String(raw));
  const toRawU = (input: string) =>
    scaleMultU > 1 ? scaleUpFromInput(input, kpi.currency ?? "", kpi.targetScale ?? "") : input;
  const fmtTargetU = (raw: number) => (scaleMultU > 1 ? toDispU(raw) : fmt(raw));
  const unitHintU = scaleMultU > 1
    ? ` (in ${curSymU} ${kpi.targetScale})`
    : numberUnitU ? ` (in ${numberUnitU})` : "";
  const [valBuf, setValBuf] = useState<{ key: string; raw: string } | null>(null);

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
          <h3 className="text-xs font-semibold text-gray-700">Weekly Values{unitHintU}</h3>
          {weeklyTarget > 0 && (
            <span className="text-[10px] text-gray-400">Weekly target: {fmtTargetU(weeklyTarget)}</span>
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
              {weeksArray(weekCount).map(w => {
                const { isPast, isFuture, locked } = weekEditState({
                  quarterPosition: updatesQuarterPos ?? "current",
                  week: w, currentWeek, canEditPastWeek, flagsLoaded: updatesGateLoaded,
                });
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
                          {updatesTabWeekLabels[w - 1] ?? weekDateLabel(kpi.year, kpi.quarter, w)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500">
                        Total: <span className="font-semibold text-gray-700">{fmtTargetU(total)}</span>
                        {isPast && <span className="ml-2 text-amber-600">· past-week locked</span>}
                        {isFuture && <span className="ml-2 text-gray-400">· future week</span>}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {ownerList.map(o => {
                        const full = `${o.firstName} ${o.lastName}`;
                        const pct = contribs[o.id] ?? 0;
                        const canEditThisRow = (canEditAnyOwner || o.id === currentUserId) && !locked;
                        const rowState = teamWeeklyState[o.id]?.[w] ?? { value: "", notes: "" };
                        const isSelf = o.id === currentUserId;
                        const ownerWeekTarget = targetForWeek(w) * (pct / 100);
                        return (
                          <div key={o.id} className="flex items-center gap-2 px-3 py-1.5">
                            <div className="w-32 flex-shrink-0">
                              <div className="text-[11px] text-gray-700 truncate">
                                {full}
                                {isSelf && <span className="ml-1 text-[9px] text-accent-500">(you)</span>}
                              </div>
                              <div className="text-[9px] text-gray-400">{pct}%</div>
                            </div>
                            <div className="w-16 flex-shrink-0 text-center">
                              <div className="text-[9px] text-gray-400 leading-none">Target{unitU ? ` (${unitU})` : ""}</div>
                              <div className="text-xs font-medium text-gray-700 mt-0.5">
                                {ownerWeekTarget > 0 || isZeroTargetKPI ? fmtTargetU(ownerWeekTarget) : "—"}
                              </div>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={valBuf?.key === `tm-${o.id}-${w}` ? valBuf.raw : toDispU(rowState.value)}
                              onChange={e => { setValBuf({ key: `tm-${o.id}-${w}`, raw: e.target.value }); handleTeamWeekChange(o.id, w, "value", toRawU(e.target.value)); }}
                              onBlur={() => setValBuf(null)}
                              readOnly={!canEditThisRow}
                              placeholder="—"
                              className={`w-24 px-2 py-1 text-xs text-center border rounded focus:outline-none ${
                                canEditThisRow
                                  ? "border-gray-200 focus:ring-1 focus:ring-accent-400"
                                  : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                              }`}
                              title={!canEditThisRow
                                ? (isFuture ? "Future week — not yet available" : isPast ? "Past week locked" : "You can only edit your own row")
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
              <div className="w-20 text-[10px] text-gray-400 font-medium text-center">Target{unitU ? ` (${unitU})` : ""}</div>
              <div className="w-24 text-[10px] text-gray-400 font-medium text-center">Value{unitU ? ` (${unitU})` : ""}</div>
              <div className="flex-1 text-[10px] text-gray-400 font-medium">Notes</div>
            </div>
            <div className="border border-gray-200 rounded-lg px-3 bg-white">
              {weeksArray(weekCount).map(w => {
                const { locked } = weekEditState({
                  quarterPosition: updatesQuarterPos ?? "current",
                  week: w, currentWeek, canEditPastWeek, flagsLoaded: updatesGateLoaded,
                });
                // When a week has no target (target = 0 or unset), lock the input
                // so nothing new can be entered — but keep any existing historical
                // value visible so previously entered data is not hidden.
                // Exception: a zero-target KPI is trackable, so its 0-target weeks
                // stay editable and display "0" rather than being locked.
                const hasTarget = isZeroTargetKPI || targetForWeek(w) > 0;
                const noTargetLocked = !hasTarget;
                return (
                <WeekRow
                  key={w}
                  weekNumber={w}
                  value={valBuf?.key === `w-${w}` ? valBuf.raw : toDispU(weeklyState[w]?.value ?? "")}
                  notes={weeklyState[w]?.notes ?? ""}
                  // Target passed in the SAME (scaled) unit as the value so the
                  // progress bar ratio stays correct.
                  weeklyTarget={scaleMultU > 1 ? targetForWeek(w) / scaleMultU : targetForWeek(w)}
                  year={kpi.year}
                  quarter={kpi.quarter}
                  dateLabel={updatesTabWeekLabels[w - 1]}
                  onValueChange={v => { setValBuf({ key: `w-${w}`, raw: v }); handleWeekChange(w, "value", toRawU(v)); }}
                  onNotesChange={n => handleWeekChange(w, "notes", n)}
                  locked={locked || noTargetLocked}
                  lockReason={noTargetLocked ? "No target set for this week." : undefined}
                  reverse={kpi.reverseColor ?? false}
                  targetDisplay={hasTarget ? fmtTargetU(targetForWeek(w)) : "—"}
                  unitSuffix={unitU}
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

export function LogModal({ kpi, onClose, onRefresh, initialTab = "updates", canUpdate = true, onOpenHistory }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: session } = useSession();
  const { data: users = [] } = useUsers();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Current week-of-quarter for the header pill. DB-driven: respects tenant's
  // QuarterSetting.startDate (may be offset from Apr 1 / Jul 1 / etc.).
  const headerCurrentWeek = useCurrentWeek(kpi.year, kpi.quarter);
  const headerQuarterPos = useQuarterPosition(kpi.year, kpi.quarter);
  const weekCount = useQuarterWeekCount(kpi.year, kpi.quarter);
  // Past-week edit flag — when off (default), the batch endpoint will reject
  // any row with weekNumber < currentWeek. The save handler uses this to
  // skip past weeks instead of sending them and getting a confusing
  // "N of 13 weeks failed" partial-success error back.
  const { canEditPastWeek: canEditPastWeekAtSave, canAddPastWeek: canAddPastWeekAtSave, loaded: flagsLoadedAtSave } = usePastWeekFlags();
  // Quarter is editable only when "Add Past Week Data" is on; mirrors the
  // gate the Edit tab uses to render the Quarter dropdown.
  const pastWeekAllowedAtSave = flagsLoadedAtSave && canAddPastWeekAtSave;

  const isTeamKPI = kpi.kpiLevel === "team";
  const currentUserId = session?.user?.id ?? "";
  // Admin signal comes from the dynamic RBAC permission set (same source as the
  // sidebar / Add buttons), NOT the legacy org-level membershipRole hierarchy:
  // a dynamic "admin" role presents as membershipRole "app_admin" (below the old
  // ADMIN tier) and was wrongly treated as a non-admin, disabling every owner row.
  const { isAdmin: isAdminActor } = useMyPermissions();
  const isTeamHeadActor = isTeamKPI && !!kpi.team?.headId && kpi.team.headId === currentUserId;
  // Shortcut used throughout: can the actor edit ANY owner's row?
  // ANDed with RBAC `update` so a no-update user can't edit weekly cells
  // even if they'd otherwise pass the instance-level check.
  const canEditAnyOwner = canUpdate && (isAdminActor || isTeamHeadActor);

  // Metadata edit is now gated solely by the RBAC v2 `update` permission.
  // The legacy instance-level rule (creator / assignee / team-head / legacy
  // admin) has been removed at the user's request — anyone with module-level
  // `KPI:update` can edit any KPI. Row-level visibility (lib/api/visibility.ts)
  // ensures non-admins only see their own KPIs in the list, so they can only
  // open and edit those.
  const metadataReadOnly = !canUpdate;

  const updateKPI = useUpdateKPI(kpi.id);
  const updateWeeklyBatch = useUpdateWeeklyValuesBatch(kpi.id);

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
      ? Object.fromEntries(Object.keys(savedWeeklyTargets).map(k => [Number(k), String(savedWeeklyTargets[k] ?? "")])) as Record<number, string>
      : buildBreakdown(divisionType, storedTarget, measurementUnit);

    // Team-KPI: rebuild ownerIds + contributions + per-owner weekly maps from
    // the saved KPI snapshot. If `weeklyOwnerTargets` is missing (legacy data),
    // each owner row is left empty and seeded from formula on first render.
    const teamOwnerIds = (kpi.ownerIds ?? []) as string[];
    const teamContribs: Record<string, string> = Object.fromEntries(
      Object.entries((kpi.ownerContributions ?? {}) as Record<string, number>).map(([id, pct]) => [id, String(pct)])
    );
    const savedOwnerTargets = kpi.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined;
    const teamWeeklyOwner: Record<string, Record<number, string>> = {};
    if (savedOwnerTargets) {
      for (const [ownerId, weekMap] of Object.entries(savedOwnerTargets)) {
        teamWeeklyOwner[ownerId] = Object.fromEntries(
          Object.keys(weekMap).map(k => [Number(k), String(weekMap[k] ?? "")])
        ) as Record<number, string>;
      }
    }

    return {
      name: kpi.name,
      description: kpi.description ?? "",
      owner: kpi.owner ?? "",
      teamId: kpi.teamId ?? "",
      parentKPIId: kpi.parentKPIId ?? "",
      quarter: kpi.quarter,
      year: String(kpi.year),
      measurementUnit,
      // Show the saved target — including exactly 0 (a valid zero goal). A bare
      // `> 0` check blanked the Edit tab for zero-target KPIs.
      target: kpi.target != null ? String(displayTarget) : "",
      quarterlyGoal: kpi.quarterlyGoal?.toString() ?? "",
      qtdGoal: kpi.qtdGoal?.toString() ?? "",
      status: kpi.status ?? "active",
      divisionType,
      weeklyBreakdown,
      currency,
      targetScale: savedScale,
      unit: kpi.unit ?? "",
      scaledDisplay: kpi.scaledDisplay ?? (measurementUnit === "Currency" && !!savedScale),
      reverseColor: kpi.reverseColor ?? false,
      kpiType: (kpi.kpiType as "NA" | "Leading" | "Lagging" | undefined) ?? "NA",
      ownerIds: teamOwnerIds,
      ownerContributions: teamContribs,
      weeklyOwnerBreakdown: teamWeeklyOwner,
      ownerKpiNames: {} as Record<string, string>,
    };
  });

  // Fetch existing child KPI names so the Edit form can pre-populate the
  // per-owner "Individual KPI name" inputs. Only runs for Team KPIs.
  useEffect(() => {
    if (!isTeamKPI) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kpi?parentKPIId=${kpi.id}&pageSize=100&kpiLevel=individual`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const rows = (json?.data?.kpis ?? []) as Array<{ owner: string | null; name: string }>;
        const map: Record<string, string> = {};
        for (const r of rows) if (r.owner && !map[r.owner]) map[r.owner] = r.name;
        if (Object.keys(map).length > 0) {
          setEditForm(f => ({ ...f, ownerKpiNames: { ...map, ...f.ownerKpiNames } }));
        }
      } catch {
        // Silent — child names are a soft enrichment, not load-bearing.
      }
    })();
    return () => { cancelled = true; };
  }, [isTeamKPI, kpi.id]);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Weekly values state for individual KPIs — one input per week.
  // For team KPIs this is still used to SHOW the aggregate (sum of owners) but not submitted.
  const [weeklyState, setWeeklyState] = useState<Record<number, { value: string; notes: string }>>(() => {
    const map: Record<number, { value: string; notes: string }> = {};
    for (let w = 1; w <= MAX_WEEKS_PER_QUARTER; w++) {
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
      for (let w = 1; w <= MAX_WEEKS_PER_QUARTER; w++) {
        const wv = list.find(x => x.weekNumber === w);
        map[w] = { value: wv?.value?.toString() ?? "", notes: wv?.notes ?? "" };
      }
      out[ownerId] = map;
    }
    return out;
  });

  // Frozen snapshot of the weekly state at modal open — used in the save
  // handler to send ONLY weeks the user actually changed. Without this, every
  // Save shipped all 13 weeks, and the server's `value ?? 0` coercion turned
  // every untouched-but-empty week into a literal 0, wiping the column.
  const initialWeeklyStateRef = useRef<Record<number, { value: string; notes: string }>>(weeklyState);
  const initialTeamWeeklyStateRef = useRef<Record<string, Record<number, { value: string; notes: string }>>>(teamWeeklyState);

  async function handleSave() {
    // Validate edit form
    const errs: Record<string, string> = {};
    if (!editForm.name.trim()) errs.name = "Required";
    // Team KPIs use ownerIds (multi-select), not the single owner field
    if (!isTeamKPI && !editForm.owner) errs.owner = "Required";

    // Cumulative: the weekly breakdown must total the target EXACTLY (under or
    // over both block). Team sums every owner cell; individual sums the single
    // row. Standalone is exempt — each week intentionally carries the full
    // target, so the sum is weeks× the target by design.
    if (editForm.divisionType === "Cumulative") {
      const isCurr = editForm.measurementUnit === "Currency";
      const scaleMult = isCurr ? getMultiplier(editForm.currency, editForm.targetScale) : 1;
      const scaledTarget = (parseFloat(editForm.target) || 0) * scaleMult;
      const weekSum = isTeamKPI && editForm.ownerIds.length > 0
        ? editForm.ownerIds.reduce((s, id) => s + sumBreakdown(editForm.weeklyOwnerBreakdown[id] ?? {}), 0)
        : sumBreakdown(editForm.weeklyBreakdown);
      const balance = checkBreakdownBalance(weekSum, scaledTarget);
      if (balance.status !== "balanced") {
        // Display in the scale unit when the toggle is on; else raw. Append the
        // Number unit (from Unit Master) when set.
        const scaled = isCurr && editForm.scaledDisplay && !!editForm.targetScale;
        const dispMult = scaled ? scaleMult : 1;
        const unit = scaled
          ? ` ${shortScaleLabel(editForm.targetScale)}`
          : editForm.measurementUnit === "Number" && editForm.unit ? ` ${editForm.unit}` : "";
        const d = (raw: number) => fmt(raw / dispMult);
        errs._ = balance.status === "under"
          ? `Weekly targets total ${d(weekSum)}${unit} — ${d(Math.abs(balance.remaining))}${unit} short of the ${d(scaledTarget)}${unit} target. Adjust the weekly cells so they add up to the target.`
          : `Weekly targets total ${d(weekSum)}${unit} — ${d(Math.abs(balance.remaining))}${unit} over the ${d(scaledTarget)}${unit} target. Reduce the weekly cells so they add up to the target.`;
      }
    }

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
      const newTarget = editForm.target
        ? (parseFloat(editForm.target) || 0) * (editForm.measurementUnit === "Currency" ? getMultiplier(editForm.currency, editForm.targetScale) : 1)
        : undefined;

      // Team KPI: the displayed Total row is derived from per-owner cells, so
      // weeklyTargets sent to the API is the per-week sum across owners.
      const weeklyTargetsPayload = (() => {
        if (isTeamKPI && editForm.ownerIds.length > 0) {
          const out: Record<string, number> = {};
          for (const w of weeksArray(weekCount)) {
            let sum = 0;
            for (const id of editForm.ownerIds) {
              sum += parseFloat(editForm.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0;
            }
            out[String(w)] = sum;
          }
          return out;
        }
        return Object.fromEntries(
          Object.entries(editForm.weeklyBreakdown).map(([k, v]) => [k, parseFloat(v) || 0])
        );
      })();

      const kpiPayload: Record<string, unknown> = {
        name: editForm.name.trim(),
        description: editForm.description || undefined,
        teamId: editForm.teamId || undefined,
        parentKPIId: editForm.parentKPIId || undefined,
        target: newTarget,
        // quarterlyGoal + qtdGoal both track the edited Target Value. `editForm.quarterlyGoal`
        // is seeded from the OLD saved value on open and is never touched by setTarget, so
        // sending it as-is persisted a stale Quarter Goal (dashboard's "Quarter Goal" column
        // reads kpi.quarterlyGoal and stayed wrong even after reload). Mirror the qtdGoal logic.
        quarterlyGoal: newTarget !== undefined ? newTarget : (editForm.quarterlyGoal ? parseFloat(editForm.quarterlyGoal) : undefined),
        qtdGoal: newTarget !== undefined ? newTarget : (editForm.qtdGoal ? parseFloat(editForm.qtdGoal) : undefined),
        status: editForm.status as "active" | "paused" | "completed",
        divisionType: editForm.divisionType,
        targetScale: editForm.measurementUnit === "Currency" ? editForm.targetScale : null,
        unit: editForm.measurementUnit === "Number" ? (editForm.unit || null) : null,
        scaledDisplay:
          editForm.measurementUnit === "Currency" && !!editForm.targetScale ? editForm.scaledDisplay : false,
        reverseColor: editForm.reverseColor,
        kpiType: editForm.kpiType,
        weeklyTargets: weeklyTargetsPayload,
      };

      // Quarter/year are immutable UNLESS "Add Past Week Data" is on, in which
      // case the Edit tab exposes the Quarter dropdown and the user may have
      // re-pointed the KPI at a different quarter.
      if (pastWeekAllowedAtSave) {
        kpiPayload.quarter = editForm.quarter;
        kpiPayload.year = parseInt(editForm.year);
      }

      if (isTeamKPI && editForm.ownerIds.length > 0) {
        kpiPayload.ownerContributions = Object.fromEntries(
          Object.entries(editForm.ownerContributions).map(([id, v]) => [id, parseFloat(v) || 0])
        );
        kpiPayload.weeklyOwnerTargets = Object.fromEntries(
          editForm.ownerIds.map(id => {
            const row = editForm.weeklyOwnerBreakdown[id] ?? {};
            return [id, Object.fromEntries(weeksArray(weekCount).map(w => [String(w), parseFloat(row[w] ?? "") || 0]))];
          })
        );
        // Per-owner Individual KPI name override — only owners with a non-empty
        // entry are sent. Server skips entries the user left blank.
        const renames: Record<string, string> = {};
        for (const id of editForm.ownerIds) {
          const v = (editForm.ownerKpiNames[id] ?? "").trim();
          if (v.length > 0) renames[id] = v;
        }
        if (Object.keys(renames).length > 0) {
          kpiPayload.ownerKpiNames = renames;
        }
      }

      // Collect weekly inputs WITHOUT starting the requests yet.
      // Metadata must commit first so the weekly endpoint reads the updated qtdGoal
      // when recomputing progressPercent — otherwise a race condition leaves it stale.
      //
      // Two filters applied per row:
      //   1. Past-week lock — skip when the tenant has it on (default) and the
      //      week is before the current quarter week. Prevents the misleading
      //      "N of 13 weeks failed" partial-success error from the server.
      //   2. Diff against the frozen snapshot at modal open — only include weeks
      //      where value OR notes actually changed. Without this, the server's
      //      `value ?? 0` coercion would turn every untouched-but-empty week
      //      into a literal 0, wiping the column on every save.
      type WeeklyInput = { weekNumber: number; value: number | null; notes: string | null; userId?: string };
      const weeklyInputs: WeeklyInput[] = [];
      // Quarter-aware so we don't ship past-/future-quarter weeks the server
      // will reject (which surfaced as a confusing "N of 13 weeks failed").
      const isPastWeekLocked = (w: number) =>
        weekEditState({
          quarterPosition: headerQuarterPos ?? "current",
          week: w,
          currentWeek: headerCurrentWeek,
          canEditPastWeek: canEditPastWeekAtSave,
          flagsLoaded: headerQuarterPos !== null,
        }).locked;
      const cellsDiffer = (
        cur: { value: string; notes: string } | undefined,
        prev: { value: string; notes: string } | undefined,
      ) =>
        (cur?.value ?? "") !== (prev?.value ?? "") ||
        (cur?.notes ?? "") !== (prev?.notes ?? "");
      if (isTeamKPI) {
        for (const ownerId of Object.keys(teamWeeklyState)) {
          // Skip owners the actor can't edit (to avoid 403 responses that would roll back the batch)
          const canEditThisOwner = canEditAnyOwner || ownerId === currentUserId;
          if (!canEditThisOwner) continue;
          for (const w of weeksArray(weekCount)) {
            if (isPastWeekLocked(w)) continue;
            const cur = teamWeeklyState[ownerId]?.[w];
            const prev = initialTeamWeeklyStateRef.current[ownerId]?.[w];
            if (!cellsDiffer(cur, prev)) continue;
            const { value, notes } = cur ?? { value: "", notes: "" };
            weeklyInputs.push({ weekNumber: w, value: value !== "" ? parseFloat(value) : null, notes: notes || null, userId: ownerId });
          }
        }
      } else {
        for (const w of weeksArray(weekCount)) {
          if (isPastWeekLocked(w)) continue;
          const cur = weeklyState[w];
          const prev = initialWeeklyStateRef.current[w];
          if (!cellsDiffer(cur, prev)) continue;
          const { value, notes } = cur ?? { value: "", notes: "" };
          weeklyInputs.push({ weekNumber: w, value: value !== "" ? parseFloat(value) : null, notes: notes || null });
        }
      }

      // Step 1: metadata first (skip when actor lacks edit permission — server would 403).
      if (!metadataReadOnly) {
        await updateKPI.mutateAsync(kpiPayload);
      }
      // Step 2: weekly values in ONE batched request. Server upserts all rows,
      // reports per-input failures (permission denied / past-week gate / etc.)
      // back in the response so we can surface partial saves.
      if (weeklyInputs.length > 0) {
        const batchResult = await updateWeeklyBatch.mutateAsync(weeklyInputs);
        if (batchResult.failed > 0) {
          const firstErr = batchResult.results.find(r => !r.ok)?.error ?? "Some weekly values could not be saved";
          const total = batchResult.results.length;
          const friendly = humanizeApiError(new Error(firstErr), { context: "weekly value" });
          const prefix = total > 1 ? `${batchResult.failed} of ${total} weeks couldn't be saved — ` : "";
          throw new Error(`${prefix}${friendly}`);
        }
      }

      onRefresh();
      onClose();
    } catch (e: unknown) {
      setSaveError(humanizeApiError(e, { context: "weekly value", fallback: "Couldn't save your changes. Please try again." }));
    } finally {
      setSaving(false);
    }
  }

  const ownerName = kpi.owner_user
    ? `${kpi.owner_user.firstName} ${kpi.owner_user.lastName}`
    : kpi.owner;

  // Build a live KPI snapshot that reflects the current editForm values so the
  // Stats tab and header badge show updated numbers without requiring a save first.
  const liveFormTarget = editForm.target
    ? (parseFloat(editForm.target) || 0) *
      (editForm.measurementUnit === "Currency" ? getMultiplier(editForm.currency, editForm.targetScale) : 1)
    : null;
  const liveProgressPercent = liveFormTarget != null && liveFormTarget > 0
    ? ((kpi.qtdAchieved ?? 0) / liveFormTarget) * 100
    : kpi.progressPercent ?? 0;
  const liveWeeklyTargets = Object.fromEntries(
    Object.entries(editForm.weeklyBreakdown).map(([k, v]) => [k, parseFloat(v) || 0])
  );
  const statsKpi: KPIRow = {
    ...kpi,
    target: liveFormTarget ?? kpi.target,
    qtdGoal: liveFormTarget ?? kpi.qtdGoal,
    // Quarterly goal tracks the user-visible target; update it so the tile
    // shows the new value immediately instead of the old saved one.
    quarterlyGoal: liveFormTarget ?? kpi.quarterlyGoal,
    weeklyTargets: liveWeeklyTargets as unknown as typeof kpi.weeklyTargets,
    progressPercent: liveProgressPercent,
    status: editForm.status,
  };

  const colors = progressColor(liveProgressPercent);

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
                {liveProgressPercent.toFixed(0)}% · {colors.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full border border-accent-100">
                <UserIcon className="h-2.5 w-2.5" />
                {ownerName}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full border border-accent-100">
                <Calendar className="h-2.5 w-2.5" />
                {fiscalYearLabel(kpi.year)} {kpi.quarter}
              </span>
              {headerCurrentWeek !== null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full border border-accent-100">
                  <CalendarDays className="h-2.5 w-2.5" />
                  Week {headerCurrentWeek}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenHistory && <HistoryButton entityId={kpi.id} onClick={onOpenHistory} />}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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

        {/* Tab content. `<fieldset disabled>` natively disables every input,
            select, textarea and button inside when RBAC denies `update`. */}
        <fieldset disabled={!canUpdate} className={`flex-1 min-w-0 overflow-y-auto px-6 py-5 ${!canUpdate ? "opacity-70" : ""}`}>
          {!canUpdate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
              Read-only — your role doesn&apos;t grant update access on this KPI.
            </div>
          )}
          {tab === "edit" && (
            <EditTab form={editForm} setForm={setEditForm} errors={editErrors} users={users} isTeamKPI={isTeamKPI} kpiOwners={kpi.owners as Array<{ id: string; firstName: string; lastName: string }> | undefined} readOnly={metadataReadOnly} />
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
              liveFormTarget={liveFormTarget}
              liveWeeklyTargets={liveWeeklyTargets}
            />
          )}
          {tab === "stats" && <StatsTab kpi={statsKpi} />}
        </fieldset>

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
            {canUpdate && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
