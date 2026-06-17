"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Save, Lock } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";

// Statutory bonus rates locked per Code on Wages 2019 / Payment of Bonus Act 1965.
const BONUS_MIN_PERCENT = 8.33;
const BONUS_MAX_PERCENT = 20;

interface BonusCfg {
  enabled: boolean;
  minPercent: number | null;
  maxPercent: number | null;
  eligibilityWageCap: number | null;
  calculationWageCap: number | null;
  payoutFrequency: "Monthly" | "Quarterly" | "HalfYearly" | "Yearly" | "OneTime";
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-transparent";

export function BonusTab({ onSaved }: { onSaved?: () => void } = {}) {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["payroll", "bonus"],
    queryFn: () => api.get<BonusCfg | null>("/api/v1/hrms/payroll/statutory/bonus"),
  });

  const [form, setForm] = useState<BonusCfg>({
    enabled: false,
    minPercent: BONUS_MIN_PERCENT,
    maxPercent: BONUS_MAX_PERCENT,
    eligibilityWageCap: 21000,
    calculationWageCap: 7000,
    payoutFrequency: "Yearly",
  });

  useEffect(() => {
    if (data?.data) setForm({
      ...form,
      ...data.data,
      // Min/Max locked per statute, regardless of stored value.
      minPercent: BONUS_MIN_PERCENT,
      maxPercent: BONUS_MAX_PERCENT,
      eligibilityWageCap: Number(data.data.eligibilityWageCap),
      calculationWageCap: Number(data.data.calculationWageCap),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: BonusCfg) =>
      api.put("/api/v1/hrms/payroll/statutory/bonus", {
        ...body,
        minPercent: BONUS_MIN_PERCENT,
        maxPercent: BONUS_MAX_PERCENT,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      onSaved?.();
    },
  });

  if (!form.enabled && !data?.data?.enabled) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">💰</div>
        <p className="text-base font-semibold text-gray-900">Are your employees eligible to receive statutory bonus?</p>
        <p className="text-xs text-gray-500 max-w-xl mx-auto mt-2">
          According to the Payment of Bonus Act, 1965, an eligible employee can receive a statutory bonus of 8.33% (min) to 20% (max) of their salary earned during a financial year. Configure statutory bonus of your organisation and start paying your employees.
        </p>
        <button
          onClick={() => setForm({ ...form, enabled: true })}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-sm font-semibold shadow-sm"
        >
          Enable Statutory Bonus
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); saveMut.mutate({ ...form, enabled: true }); }}
      className="max-w-2xl space-y-4"
    >
      <h2 className="text-base font-bold text-gray-900">Statutory Bonus</h2>
      <p className="text-[11px] text-gray-500 -mt-2">
        Min &amp; Max % locked per Code on Wages, 2019 (replaces Payment of Bonus Act, 1965 from 21-Nov-2025).
        Computed on Basic + DA, capped at Calculation Wage Cap. Provision accrued monthly; pay-out per chosen frequency.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Lock size={11} /> Minimum %
          </label>
          <input
            type="text"
            value={`${BONUS_MIN_PERCENT}%`}
            readOnly
            className={`${inputCls} bg-gray-50 font-mono`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Lock size={11} /> Maximum %
          </label>
          <input
            type="text"
            value={`${BONUS_MAX_PERCENT}%`}
            readOnly
            className={`${inputCls} bg-gray-50 font-mono`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Eligibility Wage Cap (₹) <span className="text-red-500">*</span></label>
          <NumberInput required value={form.eligibilityWageCap} onChange={(v) => setForm({ ...form, eligibilityWageCap: v })} className={inputCls} />
          <p className="text-[10px] text-gray-500 mt-1">Statutory default ₹21,000 (Basic + DA).</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Calculation Wage Cap (₹) <span className="text-red-500">*</span></label>
          <NumberInput required value={form.calculationWageCap} onChange={(v) => setForm({ ...form, calculationWageCap: v })} className={inputCls} />
          <p className="text-[10px] text-gray-500 mt-1">Statutory default ₹7,000 (or state minimum wage, whichever is higher).</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payout Frequency <span className="text-red-500">*</span></label>
          <Select
            value={form.payoutFrequency}
            onChange={(v) => setForm({ ...form, payoutFrequency: v as BonusCfg["payoutFrequency"] })}
            options={[
              { value: "Monthly", label: "Monthly" },
              { value: "Quarterly", label: "Quarterly" },
              { value: "HalfYearly", label: "Half Yearly" },
              { value: "Yearly", label: "Yearly" },
              { value: "OneTime", label: "One Time" },
            ]}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md text-sm font-semibold shadow-sm">
          <Save size={14} /> {saveMut.isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setForm({ ...form, enabled: false })} className="px-4 py-2 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium">
          Disable
        </button>
      </div>
    </form>
  );
}
