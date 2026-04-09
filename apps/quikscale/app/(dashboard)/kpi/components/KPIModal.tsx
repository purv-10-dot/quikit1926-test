"use client";

import { useState } from "react";
import { useCreateKPI, useUpdateKPI } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import type { KPIRow as KPI } from "@/lib/types/kpi";
import type { User } from "@/lib/types/kpi";
import { fiscalYearLabel, MEASUREMENT_UNITS, ALL_QUARTERS, ALL_WEEKS, weekDateLabel } from "@/lib/utils/fiscal";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
import { UserPicker } from "@/components/UserPicker";

interface Props {
  mode: "create" | "edit";
  kpi?: KPI;
  defaultYear?: number;
  defaultQuarter?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

/* ── Helpers (same formulas as LogModal EditTab) ───────────────────────── */

function fmtBreakdown(val: number, measurementUnit: string): string {
  if (measurementUnit === "Number") return String(Math.round(val));
  return val.toFixed(2);
}

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
    const diff = parseFloat((targetNum - base * 13).toFixed(2));
    ALL_WEEKS.forEach(w => { map[w] = base.toFixed(2); });
    map[13] = (base + diff).toFixed(2);
  }
  return map;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function KPIModal({ mode, kpi, defaultYear, defaultQuarter, onClose, onSuccess }: Props) {
  const [form, setForm] = useState(() => {
    const measurementUnit = kpi?.measurementUnit ?? "Number";
    const currency = kpi?.currency ?? "USD";
    const savedScale = (measurementUnit === "Currency" ? kpi?.targetScale : null) ?? "";
    const multiplier = measurementUnit === "Currency" ? getMultiplier(currency, savedScale) : 1;
    const storedTarget = kpi?.target ?? 0;
    const displayTarget = multiplier > 1 ? storedTarget / multiplier : storedTarget;
    const divisionType = (kpi?.divisionType as "Cumulative" | "Standalone") ?? "Cumulative";

    // Restore saved weekly targets or build fresh
    const savedWeeklyTargets = kpi?.weeklyTargets as Record<string, number> | null | undefined;
    const weeklyBreakdown: Record<number, string> = savedWeeklyTargets
      ? Object.fromEntries(ALL_WEEKS.map(w => [w, String(savedWeeklyTargets[String(w)] ?? "")]))
      : buildBreakdown(divisionType, storedTarget, measurementUnit);

    return {
      name: kpi?.name ?? "",
      description: kpi?.description ?? "",
      owner: kpi?.owner ?? "",
      teamId: kpi?.teamId ?? "",
      quarter: kpi?.quarter ?? defaultQuarter ?? "Q1",
      year: String(kpi?.year ?? defaultYear ?? CURRENT_YEAR),
      measurementUnit,
      target: displayTarget > 0 ? String(displayTarget) : "",
      status: kpi?.status ?? "active",
      currency,
      targetScale: savedScale,
      divisionType,
      weeklyBreakdown,
    };
  });

  const { data: users = [] } = useUsers();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const createKPI = useCreateKPI();
  const updateKPI = useUpdateKPI(kpi?.id ?? "");

  /* ── Field helpers ── */

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function actualNum(f: typeof form): number {
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
        const base = Math.floor(remaining / rightCount);
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

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "KPI name is required";
    if (!form.owner) errs.owner = "Owner is required";
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const isCurr = form.measurementUnit === "Currency";
      const multiplier = isCurr ? getMultiplier(form.currency, form.targetScale) : 1;
      const targetNum = form.target ? (parseFloat(form.target) || 0) * multiplier : undefined;
      const payload = {
        name: form.name.trim(),
        description: form.description || undefined,
        owner: form.owner,
        teamId: form.teamId || undefined,
        quarter: form.quarter as "Q1" | "Q2" | "Q3" | "Q4",
        year: parseInt(form.year),
        measurementUnit: form.measurementUnit as "Number" | "Percentage" | "Currency",
        target: targetNum,
        quarterlyGoal: targetNum,
        qtdGoal: targetNum,
        status: form.status as "active" | "paused" | "completed",
        divisionType: form.divisionType,
        currency: isCurr ? form.currency : null,
        targetScale: isCurr ? form.targetScale : null,
        weeklyTargets: Object.fromEntries(
          ALL_WEEKS.map(w => [String(w), parseFloat(form.weeklyBreakdown[w]) || 0])
        ),
      };
      if (mode === "create") {
        await createKPI.mutateAsync(payload);
      } else {
        await updateKPI.mutateAsync(payload);
      }
      onSuccess();
    } catch (err: any) {
      setErrors({ _: err.message || "Failed to save KPI" });
    } finally {
      setSaving(false);
    }
  }

  /* ── Derived ── */
  const isCurrency = form.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find(c => c.code === form.currency) ?? CURRENCIES[0];
  const scales = getScales(form.currency);
  const scaledTarget = isCurrency
    ? (parseFloat(form.target) || 0) * getMultiplier(form.currency, form.targetScale)
    : parseFloat(form.target) || 0;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              {mode === "create" ? "Add New KPI" : "Edit KPI"}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {fiscalYearLabel(parseInt(form.year))} · {form.quarter}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              {errors._}
            </div>
          )}

          {/* Owner + KPI Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Owner <span className="text-red-500">*</span>
              </label>
              <UserPicker value={form.owner} onChange={v => set("owner", v)} users={users} error={!!errors.owner} />
              {errors.owner && <p className="text-[10px] text-red-500 mt-0.5">{errors.owner}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                KPI Name <span className="text-red-500">*</span>
              </label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="Enter KPI name…"
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
              {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
            </div>
          </div>

          {/* Quarter (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
            <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
              {fiscalYearLabel(parseInt(form.year))} · {form.quarter}
            </div>
          </div>

          {/* Measurement Unit + Currency */}
          <div className={`grid gap-3 ${isCurrency ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Measurement Unit <span className="text-red-500">*</span>
              </label>
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

          {/* Division Type + Status */}
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
                    <input type="radio" name="status" value={s} checked={form.status === s}
                      onChange={() => set("status", s)} className="text-blue-600" />
                    <span className="text-xs text-gray-600 capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Enter description…"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
          </div>

          {/* Target Breakdown (editable weekly) */}
          {scaledTarget > 0 && (
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
                  ? "Remainder distributed right-to-left — edit cells to override"
                  : `Each week = full target${isCurrency ? ` (${currencyObj.symbol}${scaledTarget})` : ` (${scaledTarget})`}`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {mode === "create" ? "Create KPI" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
