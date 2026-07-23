"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Save } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";

interface EPFCfg {
  enabled: boolean;
  epfNumber: string | null;
  deductionCycle: "Monthly";
  employeeContributionRate: "TwelvePercentActual" | "TwelvePercentRestricted";
  employerContributionRate: "TwelvePercentActual" | "TwelvePercentRestricted";
  includeEmployerInCTC: boolean;
  includeEDLIInCTC: boolean;
  includeAdminChargesInCTC: boolean;
  allowOverrideAtEmployee: boolean;
  proRateRestrictedWage: boolean;
  considerAllComponentsOnLOP: boolean;
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";

export function EPFTab({ onSaved }: { onSaved?: () => void } = {}) {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["payroll", "epf"],
    queryFn: () => api.get<EPFCfg | null>("/api/v1/hrms/payroll/statutory/epf"),
  });

  const [form, setForm] = useState<EPFCfg>({
    enabled: false,
    epfNumber: "",
    deductionCycle: "Monthly",
    employeeContributionRate: "TwelvePercentActual",
    employerContributionRate: "TwelvePercentActual",
    includeEmployerInCTC: true,
    includeEDLIInCTC: false,
    includeAdminChargesInCTC: false,
    allowOverrideAtEmployee: false,
    proRateRestrictedWage: false,
    considerAllComponentsOnLOP: true,
  });

  useEffect(() => {
    if (data?.data) setForm({ ...form, ...data.data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: EPFCfg) => api.put("/api/v1/hrms/payroll/statutory/epf", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      onSaved?.();
    },
  });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate({ ...form, enabled: true });
        }}
        className="space-y-4"
      >
        <h2 className="text-[13px] font-semibold text-gray-900">Employer&apos; Provident Fund</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="EPF Number" required>
            <input
              type="text"
              placeholder="EPF number"
              value={form.epfNumber ?? ""}
              onChange={(e) => setForm({ ...form, epfNumber: e.target.value.toUpperCase() })}
              required
              maxLength={32}
              className={inputCls}
            />
          </Field>
          <Field label="Deduction Cycle">
            <input type="text" value="Monthly" readOnly className={`${inputCls} bg-gray-50`} />
          </Field>
          <Field label="Employee Contribution Rate" required>
            <Select
              value={form.employeeContributionRate}
              onChange={(v) => {
                const rate = v as EPFCfg["employeeContributionRate"];
                setForm({ ...form, employeeContributionRate: rate, employerContributionRate: rate });
              }}
              options={[
                { value: "TwelvePercentActual", label: "12% of Actual PF Wage" },
                { value: "TwelvePercentRestricted", label: "12% of Restricted PF Wage (₹15,000)" },
              ]}
            />
          </Field>
          <Field label="Employer Contribution Rate" required>
            <Select
              value={form.employerContributionRate}
              onChange={(v) => {
                const rate = v as EPFCfg["employerContributionRate"];
                setForm({ ...form, employerContributionRate: rate, employeeContributionRate: rate });
              }}
              options={[
                { value: "TwelvePercentActual", label: "12% of Actual PF Wage" },
                { value: "TwelvePercentRestricted", label: "12% of Restricted PF Wage (₹15,000)" },
              ]}
            />
          </Field>
        </div>

        <div className="space-y-2 pt-2">
          <Toggle label="Include employer's contribution in employee's salary structure." checked={form.includeEmployerInCTC} onChange={(v) => setForm({ ...form, includeEmployerInCTC: v })} />
          {form.includeEmployerInCTC && (
            <div className="pl-6 space-y-1">
              <Toggle label="Include employer's EDLI contribution in employee's salary structure." checked={form.includeEDLIInCTC} onChange={(v) => setForm({ ...form, includeEDLIInCTC: v })} />
              <Toggle label="Include admin charges in employee's salary structure." checked={form.includeAdminChargesInCTC} onChange={(v) => setForm({ ...form, includeAdminChargesInCTC: v })} />
            </div>
          )}
          <Toggle label="Override PF contribution rate at employee level" checked={form.allowOverrideAtEmployee} onChange={(v) => setForm({ ...form, allowOverrideAtEmployee: v })} />
        </div>

        <div className="pt-2">
          <p className="text-[13px] font-semibold text-gray-800 mb-2">PF Configuration when LOP Applied</p>
          <Toggle
            label="Pro-rate Restricted PF Wage"
            description="PF contribution will be pro-rated based on the number of days worked by the employee."
            checked={form.proRateRestrictedWage}
            onChange={(v) => setForm({ ...form, proRateRestrictedWage: v })}
          />
          <Toggle
            label="Consider all applicable salary components if PF wage is less than ₹15,000 after Loss of Pay"
            description="PF wage will be computed using the salary earned in that particular month (based on LOP) rather than the actual amount mentioned in the salary structure."
            checked={form.considerAllComponentsOnLOP}
            onChange={(v) => setForm({ ...form, considerAllComponentsOnLOP: v })}
          />
        </div>

        <div className="pt-3 flex gap-2">
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
          >
            <Save size={13} /> {form.enabled ? "Save" : "Enable"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 text-[#22c55e] rounded" />
      <span>
        <span>{label}</span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
