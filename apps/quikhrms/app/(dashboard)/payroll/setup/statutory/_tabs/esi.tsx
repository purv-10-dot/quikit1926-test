"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Lock, AlertCircle } from "lucide-react";
import { ESI_PATTERN, ESI_REGEX, ID_TITLES } from "@/lib/validations/identifiers";

// Statutory rates locked per ESI Act, w.e.f. 01-Jul-2019.
const ESI_EMPLOYEE_PERCENT = 0.75;
const ESI_EMPLOYER_PERCENT = 3.25;

interface ESICfg {
  enabled: boolean;
  esiNumber: string | null;
  deductionCycle: "Monthly";
  employeeContributionPercent: number | null;
  employerContributionPercent: number | null;
  includeEmployerInCTC: boolean;
  grossCeiling: number;
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-transparent";

export function ESITab({ onSaved }: { onSaved?: () => void } = {}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["payroll", "esi"],
    queryFn: () => api.get<ESICfg | null>("/api/v1/hrms/payroll/statutory/esi"),
  });

  const [form, setForm] = useState<ESICfg>({
    enabled: false,
    esiNumber: "",
    deductionCycle: "Monthly",
    employeeContributionPercent: ESI_EMPLOYEE_PERCENT,
    employerContributionPercent: ESI_EMPLOYER_PERCENT,
    includeEmployerInCTC: false,
    grossCeiling: 21000,
  });

  useEffect(() => {
    if (data?.data) setForm({
      ...form,
      ...data.data,
      // Always force statutory rates regardless of stored value.
      employeeContributionPercent: ESI_EMPLOYEE_PERCENT,
      employerContributionPercent: ESI_EMPLOYER_PERCENT,
      grossCeiling: Number(data.data.grossCeiling),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: ESICfg) => api.put("/api/v1/hrms/payroll/statutory/esi", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      onSaved?.();
    },
  });

  const esiCode = (form.esiNumber ?? "").trim();
  const esiCodeError =
    esiCode.length === 0 ? "ESI Employer Code is required"
    : !ESI_REGEX.test(esiCode) ? "Must be 17 digits — either compact (12312345600000001) or grouped (XX-XX-XXXXXX-XXX-XXXX)"
    : null;

  const grossCeilingError =
    form.grossCeiling == null || isNaN(Number(form.grossCeiling)) ? "Gross ceiling required"
    : Number(form.grossCeiling) <= 0 ? "Must be greater than 0"
    : Number(form.grossCeiling) > 1000000 ? "Unrealistic value"
    : null;

  const formInvalid = !!(esiCodeError || grossCeilingError);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (formInvalid) return;
        saveMut.mutate({
          ...form,
          esiNumber: esiCode,
          enabled: true,
          employeeContributionPercent: ESI_EMPLOYEE_PERCENT,
          employerContributionPercent: ESI_EMPLOYER_PERCENT,
        });
      }}
      noValidate
      className="max-w-2xl space-y-4"
    >
      <h2 className="text-base font-bold text-gray-900">Employees&apos; State Insurance</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ESI Employer Code" required>
          <input
            type="text"
            placeholder="31-00-123456-000-0001"
            value={form.esiNumber ?? ""}
            onChange={(e) => setForm({ ...form, esiNumber: e.target.value.toUpperCase().replace(/\s/g, "").replace(/[‐‑‒–—―−﹘－]/g, "-") })}
            required
            maxLength={21}
            pattern={ESI_PATTERN}
            title={ID_TITLES.esi}
            inputMode="numeric"
            aria-invalid={!!esiCodeError}
            aria-describedby="esi-code-help esi-code-err"
            className={`${inputCls} ${esiCodeError && esiCode.length > 0 ? "border-red-400 focus:ring-red-300" : ""}`}
          />
          {esiCodeError && esiCode.length > 0 ? (
            <p id="esi-code-err" className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
              <AlertCircle size={11} /> {esiCodeError}
            </p>
          ) : (
            <p id="esi-code-help" className="text-[10px] text-gray-500 mt-1">
              17-digit Employer Code (XX-XX-XXXXXX-XXX-XXXX) issued by ESIC. Not the 10-digit employee IP number — that belongs on each employee&apos;s profile.
            </p>
          )}
        </Field>
        <Field label="Deduction Cycle">
          <input type="text" value="Monthly" readOnly className={`${inputCls} bg-gray-50`} />
        </Field>

        <Field label="Employees' Contribution">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={`${ESI_EMPLOYEE_PERCENT}%`}
              readOnly
              className={`${inputCls} w-24 bg-gray-50 font-mono`}
            />
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Lock size={11} /> of Gross Pay
            </span>
          </div>
        </Field>
        <Field label="Employer's Contribution">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={`${ESI_EMPLOYER_PERCENT}%`}
              readOnly
              className={`${inputCls} w-24 bg-gray-50 font-mono`}
            />
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Lock size={11} /> of Gross Pay
            </span>
          </div>
        </Field>
      </div>

      <p className="text-[11px] text-gray-500 -mt-2">
        Rates locked per ESI Act, w.e.f. 01-Jul-2019. Update only via app release if Govt notifies a change.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Gross Wage Ceiling (₹)" required>
          <input
            type="number"
            min={1}
            max={1000000}
            step={1}
            value={form.grossCeiling}
            onChange={(e) => setForm({ ...form, grossCeiling: e.target.value === "" ? 0 : Number(e.target.value) })}
            required
            aria-invalid={!!grossCeilingError}
            className={`${inputCls} ${grossCeilingError ? "border-red-400 focus:ring-red-300" : ""}`}
          />
          {grossCeilingError ? (
            <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {grossCeilingError}</p>
          ) : (
            <p className="text-[10px] text-gray-500 mt-1">Statutory cap is ₹21,000/month. ESI applies only at or below this gross.</p>
          )}
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={form.includeEmployerInCTC} onChange={(e) => setForm({ ...form, includeEmployerInCTC: e.target.checked })} className="mt-0.5 text-[#3b82f6] rounded" />
        Include employer&apos;s contribution in employee&apos;s salary structure.
      </label>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-gray-700">
        <p>
          <span className="font-semibold">Note:</span> ESI deductions will be made only if the employee&apos;s monthly salary is less than or equal to ₹{form.grossCeiling.toLocaleString("en-IN")}.
          If the employee gets a salary revision which increases their monthly salary above ₹{form.grossCeiling.toLocaleString("en-IN")}, they would have to continue making ESI contributions till the end of the contribution period in which the salary was revised (April-September or October-March).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saveMut.isPending || formInvalid}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold shadow-sm"
        >
          {saveMut.isPending ? "Enabling…" : "Enable"}
        </button>
        {saveMut.isError && (
          <span className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle size={12} /> {(saveMut.error as Error).message}
          </span>
        )}
      </div>
    </form>
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
