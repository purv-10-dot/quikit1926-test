"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Save, Info, Lock } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";

type CalcType = "Flat" | "PercentOfWage";
type Cycle = "Monthly" | "Quarterly" | "HalfYearly" | "Yearly";

interface LWFCfg {
  id: string;
  enabled: boolean;
  state: string;
  calcType: CalcType;
  employeeContribution: number | string;
  employerContribution: number | string;
  employeeRate: number | string | null;
  employerRate: number | string | null;
  employeeCap: number | string | null;
  employerCap: number | string | null;
  deductionCycle: Cycle;
}

const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A]";
const lockedCls = "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-100 text-gray-700 font-mono cursor-not-allowed";

interface LWFPreset {
  applicable: boolean;
  calcType: CalcType;
  employeeContribution: number;
  employerContribution: number;
  employeeRate: number | null;
  employerRate: number | null;
  employeeCap: number | null;
  employerCap: number | null;
  deductionCycle: Cycle;
  note?: string;
}

// State-by-state LWF presets, derived from active state-LWF Acts.
// `applicable: false` means the state has no LWF act — the engine should not
// deduct LWF for employees in that state.
//
// Rates revise periodically; update this table when a state notification
// is published. Treat this as the seed; persisted records win at compute time.
const LWF_PRESETS: Record<string, LWFPreset> = {
  "Delhi":          { applicable: true, calcType: "Flat", employeeContribution: 0.75, employerContribution: 2.25, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "West Bengal":    { applicable: true, calcType: "Flat", employeeContribution: 3,   employerContribution: 30,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly", note: "Both shares revised w.e.f. 1 Jan 2024 (was ₹3 / ₹15). Remit by 15 Jul & 15 Jan via lwf.wblabour.gov.in." },
  "Punjab":         { applicable: true, calcType: "Flat", employeeContribution: 5,   employerContribution: 20,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Monthly" },
  "Gujarat":        { applicable: true, calcType: "Flat", employeeContribution: 6,   employerContribution: 12,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly", note: "Applies only to employees earning ≤ ₹15,000/month. Remit June & December." },
  "Madhya Pradesh": { applicable: true, calcType: "Flat", employeeContribution: 10,  employerContribution: 30,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Chhattisgarh":   { applicable: true, calcType: "Flat", employeeContribution: 15,  employerContribution: 45,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Karnataka":      { applicable: true, calcType: "Flat", employeeContribution: 50,  employerContribution: 100,  employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Yearly", note: "Revised 2025 (was ₹20 / ₹40). Threshold reduced 50 → 10 employees w.e.f. 7 Jan 2026. Remit by 15 Jan of the following year." },
  "Tamil Nadu":     { applicable: true, calcType: "Flat", employeeContribution: 20,  employerContribution: 40,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Yearly", note: "Revised December 2022 (was ₹10 / ₹20). Deducted from December payroll only. Return filed by 31 Jan." },
  "Odisha":         { applicable: true, calcType: "Flat", employeeContribution: 20,  employerContribution: 40,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Maharashtra":    { applicable: true, calcType: "Flat", employeeContribution: 25,  employerContribution: 75,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly", note: "Revised March 2024 (was ₹12 / ₹36). Remit by 15 Jul & 15 Jan." },
  "Andhra Pradesh": { applicable: true, calcType: "Flat", employeeContribution: 30,  employerContribution: 70,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Yearly", note: "Slab-based per AP Act — actual amount varies by salary. Excludes supervisors earning > ₹1,600/month. Default shown; verify per-employee eligibility." },
  "Telangana":      { applicable: true, calcType: "Flat", employeeContribution: 30,  employerContribution: 70,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Yearly", note: "Based on bifurcated AP Act; rates vary by salary. Verify current rates with Telangana LWF Board." },
  "Haryana":        { applicable: true, calcType: "PercentOfWage", employeeContribution: 0, employerContribution: 0, employeeRate: 0.2, employerRate: 0.4, employeeCap: 34, employerCap: 68, deductionCycle: "Monthly", note: "0.2% of wage capped at ₹34 (employee), 0.4% capped at ₹68 (employer)." },
  "Kerala":         { applicable: true, calcType: "Flat", employeeContribution: 50,  employerContribution: 50,   employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "Monthly" },
  "Goa":            { applicable: true, calcType: "Flat", employeeContribution: 60,  employerContribution: 180,  employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },

  // Non-LWF states / UTs — surface this so admins know the deduction won't apply.
  "Andaman and Nicobar Islands": { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Arunachal Pradesh":           { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Assam":                       { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Bihar":                       { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Chandigarh":                  { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Dadra and Nagar Haveli and Daman and Diu": { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Himachal Pradesh":            { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Jammu and Kashmir":           { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Jharkhand":                   { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Ladakh":                      { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Lakshadweep":                 { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Manipur":                     { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Meghalaya":                   { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Mizoram":                     { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Nagaland":                    { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Puducherry":                  { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Rajasthan":                   { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Sikkim":                      { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Tripura":                     { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Uttar Pradesh":               { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
  "Uttarakhand":                 { applicable: false, calcType: "Flat", employeeContribution: 0, employerContribution: 0, employeeRate: null, employerRate: null, employeeCap: null, employerCap: null, deductionCycle: "HalfYearly" },
};

const STATES = Object.keys(LWF_PRESETS).sort();
const DEFAULT_STATE = "Maharashtra";

interface FormState {
  enabled: boolean;
  state: string;
  calcType: CalcType;
  employeeContribution: number;
  employerContribution: number;
  employeeRate: number | null;
  employerRate: number | null;
  employeeCap: number | null;
  employerCap: number | null;
  deductionCycle: Cycle;
}

function fromPreset(state: string, enabled: boolean): FormState {
  const p = LWF_PRESETS[state];
  return {
    enabled,
    state,
    calcType: p.calcType,
    employeeContribution: p.employeeContribution,
    employerContribution: p.employerContribution,
    employeeRate: p.employeeRate,
    employerRate: p.employerRate,
    employeeCap: p.employeeCap,
    employerCap: p.employerCap,
    deductionCycle: p.deductionCycle,
  };
}

export function LWFTab({ onSaved }: { onSaved?: () => void } = {}) {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["payroll", "lwf"],
    queryFn: () => api.get<LWFCfg[]>("/api/v1/hrms/payroll/statutory/lwf"),
  });

  const [form, setForm] = useState<FormState>(() => fromPreset(DEFAULT_STATE, true));

  const handleStateChange = (newState: string) => {
    if (newState === form.state) return;
    setForm(fromPreset(newState, form.enabled));
  };

  const saveMut = useMutation({
    mutationFn: (body: FormState) => api.post("/api/v1/hrms/payroll/statutory/lwf", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      onSaved?.();
    },
  });

  const list = data?.data ?? [];
  const preset = LWF_PRESETS[form.state];
  const applicable = !!preset?.applicable;
  const isPercent = form.calcType === "PercentOfWage";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900">Labour Welfare Fund</h2>
        <p className="text-xs text-gray-500 mt-1">
          LWF is a state-administered levy. Rates and cycles below are populated from the
          state&apos;s LWF Act and are locked to prevent accidental drift from statute.
        </p>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((cfg) => {
            const pct = cfg.calcType === "PercentOfWage";
            return (
              <div key={cfg.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{cfg.state}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {pct ? "% of Wage" : "Flat"}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  {pct ? (
                    <>
                      <div className="flex justify-between"><span>Employee</span><span className="font-medium text-gray-800">{Number(cfg.employeeRate ?? 0)}% (cap ₹{Number(cfg.employeeCap ?? 0).toFixed(2)})</span></div>
                      <div className="flex justify-between"><span>Employer</span><span className="font-medium text-gray-800">{Number(cfg.employerRate ?? 0)}% (cap ₹{Number(cfg.employerCap ?? 0).toFixed(2)})</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between"><span>Employees&apos; Contribution</span><span className="font-medium text-gray-800">₹ {Number(cfg.employeeContribution).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Employer&apos;s Contribution</span><span className="font-medium text-gray-800">₹ {Number(cfg.employerContribution).toFixed(2)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between"><span>Deduction Cycle</span><span className="font-medium text-gray-800">{cfg.deductionCycle}</span></div>
                  <div className="flex justify-between"><span>Status</span><span className={cfg.enabled ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{cfg.enabled ? "Enabled" : "Disabled"}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!applicable) return;
          saveMut.mutate(form);
        }}
        className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Add / Update Configuration</p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100 text-[10px] font-bold">
            <Lock size={10} /> Rates locked to state statute
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State <span className="text-red-500">*</span></label>
            <Select
              value={form.state}
              onChange={handleStateChange}
              searchable
              options={STATES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deduction Cycle</label>
            <input type="text" readOnly value={form.deductionCycle} className={lockedCls} />
          </div>
          <div className="flex items-end">
            <label className={`flex items-center gap-2 text-sm ${applicable ? "text-gray-700" : "text-gray-400 cursor-not-allowed"}`}>
              <input
                type="checkbox"
                checked={form.enabled && applicable}
                disabled={!applicable}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded text-[#3b82f6]"
              />
              Enabled
            </label>
          </div>
        </div>

        {!applicable ? (
          <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                LWF is not applicable in {form.state}
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                This state / UT does not have a Labour Welfare Fund Act in force.
                No LWF deduction will run for employees here. Pick a state with LWF
                if you need to configure contributions.
              </p>
            </div>
          </div>
        ) : (
          <>
            {isPercent ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Locked label="Employee Rate (%)" value={form.employeeRate?.toString() ?? ""} />
                <Locked label="Employee Cap ₹" value={form.employeeCap != null ? `₹${form.employeeCap.toFixed(2)}` : ""} />
                <Locked label="Employer Rate (%)" value={form.employerRate?.toString() ?? ""} />
                <Locked label="Employer Cap ₹" value={form.employerCap != null ? `₹${form.employerCap.toFixed(2)}` : ""} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Locked label="Employee Contribution" value={`₹${form.employeeContribution.toFixed(2)}`} />
                <Locked label="Employer Contribution" value={`₹${form.employerContribution.toFixed(2)}`} />
              </div>
            )}
            <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
              <Info size={11} className="shrink-0 mt-0.5" />
              {preset?.note ?? "These figures come from the state's Labour Welfare Fund Act. If the state revises rates, update the preset in code."}
            </p>
          </>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saveMut.isPending || !applicable}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold shadow-sm"
          >
            <Save size={14} /> {saveMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 inline-flex items-center gap-1">
        {label} <Lock size={10} className="text-gray-400" />
      </label>
      <input type="text" readOnly value={value} className={lockedCls} />
    </div>
  );
}
