"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useUpdateKPI, useUpdateWeeklyValuesBatch, useNotes, useAddNote } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import type { KPIRow, WeeklyValue, User } from "@/lib/types/kpi";
import { fiscalYearLabel, weekDateLabel, ALL_WEEKS } from "@/lib/utils/fiscal";
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { UserPicker } from "@quikit/ui";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
import { WeeklyScroller } from "./WeeklyScroller";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek, useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import {
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  distributeContributionsEven,
} from "./kpiModalHelpers";
import { WeekRow } from "./WeekRow";
import { StatsTab } from "./StatsTab";
import { User as UserIcon, Calendar, CalendarDays } from "lucide-react";

interface Props {
  kpi: KPIRow;
  onClose: () => void;
  onRefresh: () => void;
  initialTab?: Tab;
  /** RBAC v2: false makes the entire drawer read-only — every input is
   *  disabled and Save Changes is hidden. Defaults to true. */
  canUpdate?: boolean;
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
  reverseColor: boolean;
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
  // Past-week lock for target breakdown editing.
  // Uses DB-driven useCurrentWeek so the week number honours the tenant's
  // configured QuarterSetting.startDate (may be offset from the hardcoded
  // Apr 1/Jul 1/Oct 1/Jan 1 map).
  const { canEditPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  const pastWeekAllowed = flagsLoaded && canEditPastWeek;
  const currentWeek = useCurrentWeek(parseInt(form.year) || null, form.quarter);
  const editTabWeekLabels = useWeekLabels(parseInt(form.year) || null, form.quarter);
  const firstEditableWeek = (currentWeek !== null && currentWeek > 1) ? currentWeek : 1;

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  /** Compute the actual (scaled) target from display value + scale */
  function actualNum(f: EditFormState): number {
    const base = parseFloat(f.target) || 0;
    if (f.measurementUnit !== "Currency") return base;
    return base * getMultiplier(f.currency, f.targetScale);
  }

  function setTargetScale(val: string) {
    setForm(f => {
      const n = (parseFloat(f.target) || 0) * getMultiplier(f.currency, val);
      return { ...f, targetScale: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek) };
    });
  }

  function setDivisionType(dt: "Cumulative" | "Standalone") {
    setForm(f => ({ ...f, divisionType: dt, weeklyBreakdown: buildBreakdown(dt, actualNum(f), f.measurementUnit, firstEditableWeek) }));
  }

  function setTarget(val: string) {
    setForm(f => {
      const n = f.measurementUnit === "Currency"
        ? (parseFloat(val) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(val) || 0;
      return { ...f, target: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek) };
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

  // ── Team-KPI helpers (mirror KPIModal) ──
  function computeAllOwnerBreakdowns(f: EditFormState): Record<string, Record<number, string>> {
    const tNum = f.measurementUnit === "Currency"
      ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
      : parseFloat(f.target) || 0;
    const out: Record<string, Record<number, string>> = {};
    for (const id of f.ownerIds) {
      const pct = parseFloat(f.ownerContributions[id]) || 0;
      out[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek);
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

      let priorSum = 0;
      for (let i = 1; i < weekNumber; i++) priorSum += parseFloat(String(existingRow[i])) || 0;
      const maxAllowed = Math.max(0, ownerSubTarget - priorSum);

      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (f.divisionType === "Cumulative" && parsed > maxAllowed) parsed = maxAllowed;

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

      let priorTeamSum = 0;
      for (let i = 1; i < weekNumber; i++) {
        for (const id of f.ownerIds) {
          priorTeamSum += parseFloat(String((f.weeklyOwnerBreakdown[id] ?? {})[i])) || 0;
        }
      }
      const maxAllowed = Math.max(0, totalTargetNum - priorTeamSum);

      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (f.divisionType === "Cumulative" && parsed > maxAllowed) parsed = maxAllowed;

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

      {targetNum > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Target Breakdown (Weekly)</label>
          <WeeklyScroller>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {isTeamKPI && form.ownerIds.length > 0 && (
                    <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left min-w-[140px]">
                      &nbsp;
                    </th>
                  )}
                  {ALL_WEEKS.map(w => {
                    const isPastWeek = currentWeek !== null && w < currentWeek;
                    const isStandaloneEditable = form.divisionType === "Standalone" && isPastWeek && pastWeekAllowed;
                    const showLock = isPastWeek && !isStandaloneEditable && !pastWeekAllowed;
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
                  {ALL_WEEKS.map(w => {
                    const isPastWeek = currentWeek !== null && w < currentWeek;
                    const isStandalone = form.divisionType === "Standalone";
                    const isStandalonePastEditable = isStandalone && isPastWeek && pastWeekAllowed;
                    const isLocked = isStandalone ? !isStandalonePastEditable : (isPastWeek && !pastWeekAllowed);

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
                          <input
                            type="number"
                            min="0"
                            value={displaySum}
                            onChange={e => setTeamTotalWeekCell(w, e.target.value)}
                            readOnly={isLocked}
                            title={isPastWeek && !pastWeekAllowed
                              ? "Past week editing is disabled. Enable in Settings > Configurations."
                              : "Editing the total redistributes across owners by contribution %"}
                            className={`w-full px-1 py-1 text-center text-xs font-semibold border rounded focus:outline-none min-w-[72px] ${
                              isLocked
                                ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                : "border-gray-200 bg-white text-gray-800 focus:ring-1 focus:ring-accent-400"
                            }`}
                          />
                        </td>
                      );
                    }

                    if (isStandalonePastEditable) {
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
                          <select
                            value={norm}
                            onChange={e => setWeekBreakdown(w, e.target.value)}
                            className="w-full px-1 py-1 text-center text-xs border rounded border-gray-200 focus:outline-none focus:ring-1 focus:ring-accent-400 min-w-[72px]"
                          >
                            <option value={zeroStr}>0</option>
                            {targetStr && <option value={targetStr}>{targetStr}</option>}
                            {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                              <option value={norm}>{norm} (custom)</option>
                            )}
                          </select>
                        </td>
                      );
                    }

                    return (
                    <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                      <input
                        type="number"
                        min="0"
                        value={form.weeklyBreakdown[w] ?? ""}
                        onChange={e => setWeekBreakdown(w, e.target.value)}
                        readOnly={isLocked}
                        title={isPastWeek && !pastWeekAllowed ? "Past week editing is disabled. Enable in Settings > Configurations." : undefined}
                        className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none min-w-[72px] ${
                          isLocked
                            ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                        }`}
                      />
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
                      {ALL_WEEKS.map(w => {
                        const isPastWeek = currentWeek !== null && w < currentWeek;
                        const isStandalone = form.divisionType === "Standalone";
                        const isLocked = isStandalone || (isPastWeek && !pastWeekAllowed);
                        return (
                          <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                            <input
                              type="number"
                              min="0"
                              value={ownerRow[w] ?? ""}
                              onChange={e => setOwnerWeekCell(id, w, e.target.value)}
                              readOnly={isLocked}
                              title={isPastWeek && !pastWeekAllowed
                                ? "Past week editing is disabled. Enable in Settings > Configurations."
                                : isStandalone ? "Standalone mode locks per-owner cells" : undefined}
                              className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none min-w-[72px] ${
                                isLocked
                                  ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                  : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                              }`}
                            />
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
  const { canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(kpi.year, kpi.quarter);
  const updatesTabWeekLabels = useWeekLabels(kpi.year, kpi.quarter);

  // Use live form target when available so the header and per-week targets
  // reflect editForm changes immediately (before save).
  const weeklyTarget = (liveFormTarget ?? kpi.qtdGoal ?? kpi.target ?? 0) / 13;
  const isTeamKPI = kpi.kpiLevel === "team";
  const ownerList = (kpi.owners ?? []) as Array<{ id: string; firstName: string; lastName: string }>;
  const contribs = (kpi.ownerContributions as Record<string, number> | null | undefined) ?? {};
  // Prefer live breakdown (from editForm) over DB snapshot so the per-week
  // target display updates before the user hits Save.
  const savedWeeklyTargets: Record<string, number> | null =
    liveWeeklyTargets ?? (kpi.weeklyTargets as Record<string, number> | null | undefined) ?? null;
  const targetForWeek = (w: number): number =>
    savedWeeklyTargets?.[String(w)] ?? weeklyTarget;

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
                const isPast = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                const isFuture = currentWeek !== null && w > currentWeek;
                const locked = isPast || isFuture;
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
                        Total: <span className="font-semibold text-gray-700">{fmt(total)}</span>
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
                              <div className="text-[9px] text-gray-400 leading-none">Target</div>
                              <div className="text-xs font-medium text-gray-700 mt-0.5">
                                {ownerWeekTarget > 0 ? fmt(ownerWeekTarget) : "—"}
                              </div>
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
              <div className="w-20 text-[10px] text-gray-400 font-medium text-center">Target</div>
              <div className="w-24 text-[10px] text-gray-400 font-medium text-center">Value</div>
              <div className="flex-1 text-[10px] text-gray-400 font-medium">Notes</div>
            </div>
            <div className="border border-gray-200 rounded-lg px-3 bg-white">
              {ALL_WEEKS.map(w => {
                const isPast = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                const isFuture = currentWeek !== null && w > currentWeek;
                const locked = isPast || isFuture;
                // When a week has no target (target = 0 or unset), lock the input
                // so nothing new can be entered — but keep any existing historical
                // value visible so previously entered data is not hidden.
                const hasTarget = targetForWeek(w) > 0;
                const noTargetLocked = !hasTarget;
                return (
                <WeekRow
                  key={w}
                  weekNumber={w}
                  value={weeklyState[w]?.value ?? ""}
                  notes={weeklyState[w]?.notes ?? ""}
                  weeklyTarget={targetForWeek(w)}
                  year={kpi.year}
                  quarter={kpi.quarter}
                  dateLabel={updatesTabWeekLabels[w - 1]}
                  onValueChange={v => handleWeekChange(w, "value", v)}
                  onNotesChange={n => handleWeekChange(w, "notes", n)}
                  locked={locked || noTargetLocked}
                  lockReason={noTargetLocked ? "No target set for this week." : undefined}
                  reverse={kpi.reverseColor ?? false}
                  targetDisplay={hasTarget ? fmt(targetForWeek(w)) : "—"}
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

export function LogModal({ kpi, onClose, onRefresh, initialTab = "updates", canUpdate = true }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: session } = useSession();
  const { data: users = [] } = useUsers();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Current week-of-quarter for the header pill. DB-driven: respects tenant's
  // QuarterSetting.startDate (may be offset from Apr 1 / Jul 1 / etc.).
  const headerCurrentWeek = useCurrentWeek(kpi.year, kpi.quarter);

  const isTeamKPI = kpi.kpiLevel === "team";
  const currentUserId = session?.user?.id ?? "";
  const sessionRole = (session?.user as { membershipRole?: string } | undefined)?.membershipRole;
  const isAdminActor =
    (sessionRole && (ROLE_HIERARCHY[sessionRole] ?? 0) >= ROLE_HIERARCHY[ROLES.ADMIN]) ||
    !!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
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
      ? Object.fromEntries(ALL_WEEKS.map(w => [w, String(savedWeeklyTargets[String(w)] ?? "")])) as Record<number, string>
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
          ALL_WEEKS.map(w => [w, String(weekMap[String(w)] ?? "")])
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
      target: displayTarget > 0 ? String(displayTarget) : "",
      quarterlyGoal: kpi.quarterlyGoal?.toString() ?? "",
      qtdGoal: kpi.qtdGoal?.toString() ?? "",
      status: kpi.status ?? "active",
      divisionType,
      weeklyBreakdown,
      currency,
      targetScale: savedScale,
      reverseColor: kpi.reverseColor ?? false,
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
      const newTarget = editForm.target
        ? (parseFloat(editForm.target) || 0) * (editForm.measurementUnit === "Currency" ? getMultiplier(editForm.currency, editForm.targetScale) : 1)
        : undefined;

      // Team KPI: the displayed Total row is derived from per-owner cells, so
      // weeklyTargets sent to the API is the per-week sum across owners.
      const weeklyTargetsPayload = (() => {
        if (isTeamKPI && editForm.ownerIds.length > 0) {
          const out: Record<string, number> = {};
          for (const w of ALL_WEEKS) {
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
        quarterlyGoal: editForm.quarterlyGoal ? parseFloat(editForm.quarterlyGoal) : undefined,
        qtdGoal: newTarget !== undefined ? newTarget : (editForm.qtdGoal ? parseFloat(editForm.qtdGoal) : undefined),
        status: editForm.status as "active" | "paused" | "completed",
        divisionType: editForm.divisionType,
        targetScale: editForm.measurementUnit === "Currency" ? editForm.targetScale : null,
        reverseColor: editForm.reverseColor,
        weeklyTargets: weeklyTargetsPayload,
      };

      if (isTeamKPI && editForm.ownerIds.length > 0) {
        kpiPayload.ownerContributions = Object.fromEntries(
          Object.entries(editForm.ownerContributions).map(([id, v]) => [id, parseFloat(v) || 0])
        );
        kpiPayload.weeklyOwnerTargets = Object.fromEntries(
          editForm.ownerIds.map(id => {
            const row = editForm.weeklyOwnerBreakdown[id] ?? {};
            return [id, Object.fromEntries(ALL_WEEKS.map(w => [String(w), parseFloat(row[w] ?? "") || 0]))];
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
      type WeeklyInput = { weekNumber: number; value: number | null; notes: string | null; userId?: string };
      const weeklyInputs: WeeklyInput[] = [];
      if (isTeamKPI) {
        for (const ownerId of Object.keys(teamWeeklyState)) {
          // Skip owners the actor can't edit (to avoid 403 responses that would roll back the batch)
          const canEditThisOwner = canEditAnyOwner || ownerId === currentUserId;
          if (!canEditThisOwner) continue;
          for (const w of ALL_WEEKS) {
            const { value, notes } = teamWeeklyState[ownerId]?.[w] ?? { value: "", notes: "" };
            weeklyInputs.push({ weekNumber: w, value: value !== "" ? parseFloat(value) : null, notes: notes || null, userId: ownerId });
          }
        }
      } else {
        for (const w of ALL_WEEKS) {
          const newWeeklyTarget = parseFloat(editForm.weeklyBreakdown[w]) || 0;
          if (newWeeklyTarget === 0) {
            // No target for this week after the save — wipe any existing value + notes
            // so stale data doesn't persist in the DB or skew stats calculations.
            weeklyInputs.push({ weekNumber: w, value: null, notes: null });
          } else {
            const { value, notes } = weeklyState[w] ?? { value: "", notes: "" };
            weeklyInputs.push({ weekNumber: w, value: value !== "" ? parseFloat(value) : null, notes: notes || null });
          }
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
          throw new Error(`${batchResult.failed} of ${batchResult.results.length} weeks failed: ${firstErr}`);
        }
      }

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

        {/* Tab content. `<fieldset disabled>` natively disables every input,
            select, textarea and button inside when RBAC denies `update`. */}
        <fieldset disabled={!canUpdate} className={`flex-1 overflow-y-auto px-6 py-5 ${!canUpdate ? "opacity-70" : ""}`}>
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
