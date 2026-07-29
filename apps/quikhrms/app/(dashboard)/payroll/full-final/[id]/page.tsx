"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PageBackground } from "@/components/hrms/page-background";
import { RefreshCw, Save, Check, BadgeIndianRupee } from "lucide-react";
import { clsx } from "clsx";

interface FNF {
  id: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string; dateOfJoining: string; workEmail: string | null } | null;
  resignationDate: string;
  lastWorkingDate: string;
  reason: string | null;
  status: "Draft" | "Computed" | "Approved" | "Paid" | "Cancelled";
  pendingSalary: string;
  leaveEncashment: string;
  gratuityAmount: string;
  bonusAmount: string;
  noticePayRecovery: string;
  loanRecovery: string;
  otherEarnings: string;
  otherDeductions: string;
  tdsDeducted: string;
  netSettlement: string;
  notes: string | null;
  details: Record<string, unknown> | null;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export default function FNFDetailPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "full-final", id],
    queryFn: () => api.get<FNF>(`/api/v1/hrms/payroll/full-final/${id}`),
  });
  const fnf = data?.data;

  const [form, setForm] = useState<Partial<Record<keyof FNF, string>>>({});
  useEffect(() => {
    if (fnf) {
      setForm({
        pendingSalary: fnf.pendingSalary,
        leaveEncashment: fnf.leaveEncashment,
        gratuityAmount: fnf.gratuityAmount,
        bonusAmount: fnf.bonusAmount,
        noticePayRecovery: fnf.noticePayRecovery,
        loanRecovery: fnf.loanRecovery,
        otherEarnings: fnf.otherEarnings,
        otherDeductions: fnf.otherDeductions,
        tdsDeducted: fnf.tdsDeducted,
        notes: fnf.notes ?? "",
      });
    }
  }, [fnf]);

  const recomputeMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/payroll/full-final/${id}`, {}),
    onSuccess: () => { toast.success("Recomputed"); qc.invalidateQueries({ queryKey: ["payroll", "full-final", id] }); },
  });
  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/hrms/payroll/full-final/${id}`, body),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["payroll", "full-final", id] }); },
  });

  if (isLoading || !fnf) return <div className="p-8 text-xs text-gray-500">Loading…</div>;

  const setNum = (k: keyof FNF, v: number | null) => setForm((p) => ({ ...p, [k]: v == null ? "" : String(v) }));

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#166534]";

  const persistValues = () => {
    const numFields: (keyof FNF)[] = ["pendingSalary","leaveEncashment","gratuityAmount","bonusAmount","noticePayRecovery","loanRecovery","otherEarnings","otherDeductions","tdsDeducted"];
    const body: Record<string, unknown> = {};
    for (const k of numFields) {
      const v = form[k];
      if (v !== undefined) body[k] = Number(v);
    }
    if (form.notes !== undefined) body.notes = form.notes ?? null;
    saveMut.mutate(body);
  };

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-page-title text-gray-900">
              Full &amp; Final — {fnf.employee?.firstName} {fnf.employee?.lastName}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {fnf.employee?.employeeCode} · DoJ: {fnf.employee?.dateOfJoining ? new Date(fnf.employee.dateOfJoining).toLocaleDateString("en-IN") : "—"} ·
              LWD: {new Date(fnf.lastWorkingDate).toLocaleDateString("en-IN")}
            </p>
            {fnf.reason && <p className="text-xs text-gray-600 mt-1">Reason: {fnf.reason}</p>}
          </div>
          <div className="flex gap-2">
            <span className={clsx("text-[11px] font-medium px-2 py-1 rounded",
              fnf.status === "Paid" ? "bg-emerald-100 text-emerald-700" :
              fnf.status === "Approved" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
            )}>{fnf.status}</span>
            {fnf.status !== "Paid" && (
              <button
                onClick={() => recomputeMut.mutate()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-[var(--border)] rounded-md text-xs font-medium"
              >
                <RefreshCw size={13} /> Recompute
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="text-[13px] font-semibold text-gray-900 mb-4">Settlement Components</h2>
        <table className="w-full text-xs">
          <tbody>
            {[
              { k: "pendingSalary" as const, label: "Pending Salary (worked days)", earn: true },
              { k: "leaveEncashment" as const, label: "Leave Encashment", earn: true },
              { k: "gratuityAmount" as const, label: "Gratuity (15/26 × yrs × Basic+DA)", earn: true },
              { k: "bonusAmount" as const, label: "Bonus / Pro-rated Bonus", earn: true },
              { k: "otherEarnings" as const, label: "Other Earnings", earn: true },
              { k: "noticePayRecovery" as const, label: "Notice Pay Recovery", earn: false },
              { k: "loanRecovery" as const, label: "Loan Recovery", earn: false },
              { k: "otherDeductions" as const, label: "Other Deductions", earn: false },
              { k: "tdsDeducted" as const, label: "TDS Deducted", earn: false },
            ].map((row) => (
              <tr key={row.k} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-700">{row.label}</td>
                <td className={clsx("py-2 pl-3 text-xs font-semibold w-32", row.earn ? "text-emerald-700" : "text-red-700")}>
                  {row.earn ? "Earning" : "Deduction"}
                </td>
                <td className="py-2 pl-3 w-44">
                  <NumberInput
                    value={form[row.k] === "" || form[row.k] == null ? null : Number(form[row.k])}
                    onChange={(v) => setNum(row.k, v)}
                    disabled={fnf.status === "Paid"}
                    className={inputCls}
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-emerald-50">
              <td className="py-3 pr-3 font-bold text-gray-900">Net Settlement</td>
              <td className="py-3 pl-3" />
              <td className="py-3 pl-3 text-right text-sm font-bold text-emerald-800">₹{INR.format(Number(fnf.netSettlement))}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
          <textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            disabled={fnf.status === "Paid"}
            className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={persistValues}
            disabled={saveMut.isPending || fnf.status === "Paid"}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
          >
            <Save size={13} /> Save
          </button>
          {fnf.status === "Computed" && (
            <button
              onClick={() => saveMut.mutate({ status: "Approved" })}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-medium"
            >
              <Check size={13} /> Approve
            </button>
          )}
          {fnf.status === "Approved" && (
            <button
              onClick={() => saveMut.mutate({ status: "Paid" })}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium"
            >
              <BadgeIndianRupee size={13} /> Mark Paid
            </button>
          )}
        </div>
      </div>

      {fnf.details && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Computation Details</h3>
          <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(fnf.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
