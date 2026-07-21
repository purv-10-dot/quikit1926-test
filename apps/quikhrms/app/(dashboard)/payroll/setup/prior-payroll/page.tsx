"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { History, Save, Calendar, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PriorPayrollUpload } from "./_components/prior-payroll-upload";
import { PriorPayrollRecords } from "./_components/prior-payroll-records";

interface PriorPayroll {
  id: string;
  enabled: boolean;
  financialYear: string | null;
  fromMonth: string | null;
  toMonth: string | null;
  dataUploaded: boolean;
  notes: string | null;
}

interface Res {
  prior: PriorPayroll | null;
  paySchedulePresent: boolean;
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";

function currentFinancialYear(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

export default function PriorPayrollPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      <PriorPayrollPageInner />
    </Suspense>
  );
}

function PriorPayrollPageInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/payroll/setup";
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "prior-payroll"],
    queryFn: () => api.get<Res>("/api/v1/hrms/payroll/prior-payroll"),
  });

  const res = data?.data;
  const paySchedulePresent = res?.paySchedulePresent ?? false;
  const prior = res?.prior;

  const [form, setForm] = useState({
    enabled: true,
    financialYear: currentFinancialYear(),
    fromMonth: "",
    toMonth: "",
    notes: "",
  });

  useEffect(() => {
    if (prior) {
      setForm({
        enabled: prior.enabled,
        financialYear: prior.financialYear ?? currentFinancialYear(),
        fromMonth: prior.fromMonth ? prior.fromMonth.slice(0, 7) : "",
        toMonth: prior.toMonth ? prior.toMonth.slice(0, 7) : "",
        notes: prior.notes ?? "",
      });
    }
  }, [prior]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put("/api/v1/hrms/payroll/prior-payroll", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setSaved(true);
      // Only auto-navigate when the user came from a guided onboarding flow
      // (returnTo query param). Otherwise stay so they can use the YTD
      // upload widget that appears below once prior payroll is enabled.
      if (returnTo && returnTo.startsWith("/")) {
        setTimeout(() => router.push(returnTo), 800);
      } else {
        setTimeout(() => setSaved(false), 2000);
      }
    },
  });

  const disableMut = useMutation({
    mutationFn: () => api.put("/api/v1/hrms/payroll/prior-payroll", {
      enabled: false, financialYear: null, fromMonth: null, toMonth: null, notes: null, dataUploaded: false,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll"] }),
  });

  if (isLoading) return (
    <div className="p-5 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
          <History size={18} className="text-[#22c55e]" />
          <h1 className="text-base font-semibold text-gray-900">Prior Payroll</h1>
        </div>

        {!paySchedulePresent ? (
          <div className="py-16 px-5 text-center">
            <div className="mx-auto w-28 h-28 rounded-xl bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
              <Calendar size={48} className="text-[#bbf7d0]" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-gray-600 max-w-md mx-auto">
              You need to configure your pay schedule first in order to enter your past payroll details.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                onClick={() => router.push("/payroll/setup/pay-schedule")}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
              >
                Configure Pay Schedule
              </button>
              <button
                onClick={() => disableMut.mutate()}
                disabled={disableMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium disabled:opacity-60"
              >
                {disableMut.isPending ? "Disabling..." : "Disable Prior Payroll"}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate({
                enabled: true,
                financialYear: form.financialYear,
                fromMonth: form.fromMonth ? `${form.fromMonth}-01` : null,
                toMonth: form.toMonth ? `${form.toMonth}-01` : null,
                notes: form.notes || null,
              });
            }}
            className="p-4 space-y-4"
          >
            <div className="rounded-md border border-[#dcfce7] bg-[#dcfce7] px-3 py-2 text-xs text-[#15803d]">
              <p className="font-semibold">Go-live with mid-year payroll</p>
              <p className="mt-1">Upload your previously processed payrolls for the current financial year so that tax projections, YTD and tax computation include historical data.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Financial Year <span className="text-red-500">*</span></label>
                <Select
                  value={form.financialYear}
                  onChange={(v) => setForm({ ...form, financialYear: v })}
                  options={Array.from({ length: 5 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    const fy = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
                    return { value: fy, label: `FY ${fy}` };
                  })}
                />
              </div>
              <div />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">From Month <span className="text-red-500">*</span></label>
                <input type="month" required value={form.fromMonth} onChange={(e) => setForm({ ...form, fromMonth: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">To Month <span className="text-red-500">*</span></label>
                <input type="month" required value={form.toMonth} onChange={(e) => setForm({ ...form, toMonth: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} placeholder="Optional notes about prior payroll period" />
              </div>
            </div>

            {saved && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                <CheckCircle2 size={16} />
                {returnTo && returnTo.startsWith("/")
                  ? "Prior payroll saved. Redirecting..."
                  : "Prior payroll saved. Upload YTD records below ↓"}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="flex gap-2">
                <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
                  <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => disableMut.mutate()}
                  disabled={disableMut.isPending}
                  className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium disabled:opacity-60"
                >
                  Disable Prior Payroll
                </button>
              </div>
              <p className="text-xs text-gray-500">Status: {prior?.enabled ? "Enabled" : "Disabled"}</p>
            </div>
          </form>
        )}
      </div>

      {/* Upload widget lives outside the settings <form> so submitting the
          settings doesn't trigger the upload (and vice-versa). Only rendered
          when pay schedule + prior-payroll settings exist — there's no point
          uploading records before HR has decided to enable prior payroll. */}
      {paySchedulePresent && prior?.enabled && (
        <>
          <PriorPayrollUpload />
          <PriorPayrollRecords />
        </>
      )}
    </div>
  );
}
