"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ChevronLeft, Calculator, Check, Send, Eye, Download, FileText, Building2, AlertTriangle, X, FileSpreadsheet, Pencil, RotateCcw, Gift, ArrowUpRight, Search } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { Select } from "@/components/hrms/select";
import { useToast } from "@/components/hrms/toast";
import { withBasePath } from "@/lib/utils/base-path";

interface PayslipLine {
  id: string;
  componentCode: string;
  componentName: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  amount: string | number;
}

interface PayslipAdjustment {
  paidDaysOverride: number;
  reason: string | null;
  updatedAt: string;
}

interface TdsAdjustment {
  id: string;
  originalTds: number;
  overrideTds: number;
  shortfall: number;
  strategy: "NextMonth" | "SpreadOverMonths";
  recoveryMonths: number;
  perMonthAmount: number;
  recoveryStart: string;
  recoveryEnd: string;
  reason: string | null;
}

interface TdsRecovery {
  id: string;
  fromPeriod: string;
  shortfall: number;
  perMonthAmount: number;
  recoveryStart: string;
  recoveryEnd: string;
}

interface Payslip {
  id: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    workEmail: string;
    department: { name: string } | null;
    designation: { title: string } | null;
  } | null;
  workingDays: string | number;
  paidDays: string | number;
  lopDays: string | number;
  grossEarnings: string | number;
  totalDeductions: string | number;
  netPay: string | number;
  status: "Draft" | "Generated" | "Released" | "Failed";
  lines: PayslipLine[];
  adjustment: PayslipAdjustment | null;
  tdsAdjustment: TdsAdjustment | null;
  tdsRecoveries: TdsRecovery[];
}

interface OneTimeEntry {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string } | null;
  kind: "Bonus" | "Arrears" | "Incentive" | "Commission" | "PerformanceBonus" | "ReferralBonus" | "Other" | "Deduction";
  category: string;
  componentCode: string;
  componentName: string;
  amount: number;
  payPeriod: string;
  status: "Pending" | "Approved" | "Applied" | "Rejected";
  reason: string | null;
  rejectionReason: string | null;
}

interface PayRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: "Draft" | "Processing" | "Approved" | "Paid" | "Cancelled";
  employeeCount: number;
  totalGross: string | number;
  totalNet: string | number;
  totalDeductions: string | number;
  notes: string | null;
  payslips: Payslip[];
  oneTimeEarnings: OneTimeEntry[];
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function statusClass(s: string) {
  switch (s) {
    case "Draft": return "bg-gray-100 text-gray-700";
    case "Processing": return "bg-[#dcfce7] text-[#16a34a]";
    case "Approved": return "bg-amber-100 text-amber-700";
    case "Paid": return "bg-emerald-100 text-emerald-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function PayRunDetailPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["payroll", "runs", id],
    queryFn: () => api.get<PayRun>(`/api/v1/hrms/payroll/runs/${id}`),
    retry: false,
  });

  const { data: computeStatusRes } = useQuery({
    queryKey: ["payroll", "runs", id, "compute-status"],
    queryFn: () =>
      api.get<{
        runId: string;
        runStatus: string;
        compute: {
          status: "queued" | "running" | "done" | "failed" | "idle";
          startedAt?: string;
          finishedAt?: string;
          employeeCount?: number;
          totalNet?: number;
          error?: string;
        };
      }>(`/api/v1/hrms/payroll/runs/${id}/compute/status`),
    refetchInterval: (q) => {
      const s = q.state.data?.data?.compute?.status;
      return s === "queued" || s === "running" ? 2000 : false;
    },
  });

  const computeRunning =
    computeStatusRes?.data?.compute?.status === "queued" ||
    computeStatusRes?.data?.compute?.status === "running";

  const prevComputeStatus = (computeStatusRes?.data?.compute?.status ?? "idle") as string;

  // When compute transitions to terminal state, refresh the run to pull payslips
  useEffect(() => {
    if (prevComputeStatus === "done" || prevComputeStatus === "failed") {
      qc.invalidateQueries({ queryKey: ["payroll", "runs", id] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevComputeStatus]);

  const computeMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/payroll/runs/${id}/compute`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll", "runs", id, "compute-status"] });
    },
  });
  const approveMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/payroll/runs/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "runs", id] }),
  });
  const releaseMut = useMutation({
    // Surfaced via the toast.promise below — suppress the global modal.
    meta: { suppressGlobalError: true },
    mutationFn: () => api.post(`/api/v1/hrms/payroll/runs/${id}/release`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "runs", id] }),
  });

  interface MissingEmailRow { employeeId: string; employeeCode: string; name: string }
  interface PreflightResult { totalPayslips: number; missingEmailCount: number; missingEmail: MissingEmailRow[] }

  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Payslip | null>(null);
  const [empFilter, setEmpFilter] = useState("");
  const [tdsTarget, setTdsTarget] = useState<Payslip | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "release" | null>(null);

  const handleRelease = async () => {
    // Always show the confirm modal — preflight runs inside it
    setPreflight(null);
    try {
      const res = await api.get<PreflightResult>(`/api/v1/hrms/payroll/runs/${id}/release-preflight`);
      setPreflight(res.data);
    } catch {
      // Preflight failed — show modal anyway so user can still proceed
      setPreflight({ totalPayslips: 0, missingEmailCount: 0, missingEmail: [] });
    }
    setConfirmAction("release");
  };

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );
  if (isError || !data?.data) return (
    <div className="p-8 space-y-3 text-center">
      <p className="text-sm text-gray-700 font-medium">Pay run not found.</p>
      <p className="text-xs text-gray-500">{(error as Error | null)?.message ?? "It may have been deleted."}</p>
      <Link href="/payroll/runs" className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline">
        <ChevronLeft size={14} /> Back to Pay Runs
      </Link>
    </div>
  );
  const run = data.data;
  const busy = computeMut.isPending || approveMut.isPending || releaseMut.isPending;

  const empQuery = empFilter.trim().toLowerCase();
  const visiblePayslips = empQuery
    ? run.payslips.filter((p) => {
        const name = p.employee ? `${p.employee.firstName} ${p.employee.lastName}`.toLowerCase() : "";
        return (
          name.includes(empQuery) ||
          (p.employee?.employeeCode ?? "").toLowerCase().includes(empQuery) ||
          (p.employee?.department?.name ?? "").toLowerCase().includes(empQuery)
        );
      })
    : run.payslips;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-page-title text-gray-900">
                Payroll for {new Date(run.periodStart).toLocaleString("en-IN", { month: "long", year: "numeric" })}
              </h1>
              <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded", statusClass(run.status))}>{run.status}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Period: {new Date(run.periodStart).toLocaleDateString("en-IN")} — {new Date(run.periodEnd).toLocaleDateString("en-IN")} · Pay Date: {new Date(run.payDate).toLocaleDateString("en-IN")}
            </p>
            {run.notes && <p className="text-xs text-gray-600 mt-2">{run.notes}</p>}
          </div>
          <div className="flex gap-2">
            {(run.status === "Draft" || run.status === "Processing") && (
              <button
                onClick={() => computeMut.mutate()}
                disabled={busy || computeRunning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
              >
                <Calculator size={13} /> {
                  computeMut.isPending
                    ? "Queueing..."
                    : computeRunning
                      ? (computeStatusRes?.data?.compute?.status === "queued" ? "Queued..." : "Computing...")
                      : run.status === "Processing" ? "Recompute" : "Compute Payslips"
                }
              </button>
            )}
            {run.status === "Processing" && (
              <button
                onClick={() => setConfirmAction("approve")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
              >
                <Check size={13} /> {approveMut.isPending ? "Approving..." : "Approve"}
              </button>
            )}
            {run.status === "Approved" && (
              <button
                onClick={handleRelease}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
              >
                <Send size={13} /> {releaseMut.isPending ? "Releasing..." : "Release Payslips"}
              </button>
            )}
            {(run.status === "Approved" || run.status === "Paid") && (
              <>
                <BankAdviceMenu runId={run.id} />
                <Link
                  href={`/payroll/runs/${run.id}/reconcile`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-[var(--border)] rounded-md text-xs font-medium"
                  title="Bank Reconciliation"
                >
                  <Building2 size={13} /> Reconcile
                </Link>
                <Form24QButton
                  runId={run.id}
                  scope="run"
                  label="24Q"
                  title="Form 24Q — this pay run only (deductee-wise, single month)"
                />
                <Form24QButton
                  runId={run.id}
                  scope="quarter"
                  label="24Q (Q)"
                  title="Form 24Q — full calendar quarter (what you'd upload to the IT portal)"
                />
              </>
            )}
            {/* Always-on Excel export of tax / statutory breakdown for the run.
                Uses api.download() so auth headers (x-tenant-id / x-user-id)
                are sent — a raw <a href> would 401. */}
            {run.payslips.length > 0 && (
              <TaxExcelButton runId={run.id} />
            )}
          </div>
        </div>

        {computeStatusRes?.data?.compute && computeStatusRes.data.compute.status !== "idle" && computeStatusRes.data.compute.status !== "done" && (
          <div className={clsx(
            "mt-4 rounded-md border px-3 py-2 text-xs",
            computeStatusRes.data.compute.status === "failed"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-green-50 border-green-200 text-green-800",
          )}>
            <div className="font-semibold">
              {computeStatusRes.data.compute.status === "queued" && "Compute job queued — waiting for worker..."}
              {computeStatusRes.data.compute.status === "running" && "Computing payslips in background..."}
              {computeStatusRes.data.compute.status === "failed" && "Compute failed"}
            </div>
            {computeStatusRes.data.compute.error && (
              <div className="mt-1 font-mono text-[11px]">{computeStatusRes.data.compute.error}</div>
            )}
            {computeStatusRes.data.compute.startedAt && (
              <div className="mt-1 text-[11px] opacity-75">
                Started: {new Date(computeStatusRes.data.compute.startedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-4 gap-3">
          <KPI label="Employees" value={String(run.employeeCount)} />
          <KPI label="Gross Earnings" value={`₹${INR.format(Number(run.totalGross))}`} />
          <KPI label="Deductions" value={`₹${INR.format(Number(run.totalDeductions))}`} />
          <KPI label="Net Pay" value={`₹${INR.format(Number(run.totalNet))}`} />
        </div>
      </div>

      <OneTimeEntriesPanel
        runId={run.id}
        runStatus={run.status}
        entries={run.oneTimeEarnings}
        onChanged={() => qc.invalidateQueries({ queryKey: ["payroll", "runs", id] })}
      />

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-gray-900">Payslips</h2>
          {run.payslips.length > 0 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={empFilter}
                onChange={(e) => setEmpFilter(e.target.value)}
                placeholder="Filter by employee, code or dept…"
                className="w-72 max-w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>
          )}
        </div>
        {run.payslips.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500">
            No payslips yet. Click <span className="font-semibold">Compute Payslips</span> to generate.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Department</th>
                <th className="text-right py-2 px-3">Paid Days</th>
                <th className="text-right py-2 px-3">Gross</th>
                <th className="text-right py-2 px-3">Deductions</th>
                <th className="text-right py-2 px-3">Net Pay</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visiblePayslips.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-gray-500">No payslips match “{empFilter}”.</td>
                </tr>
              )}
              {visiblePayslips.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "Unknown"}</p>
                    <p className="text-xs text-gray-500">{p.employee?.employeeCode}</p>
                  </td>
                  <td className="py-3 px-3 text-gray-700">{p.employee?.department?.name ?? "—"}</td>
                  <td className="py-3 px-3 text-right">
                    {(run.status === "Draft" || run.status === "Processing") && !computeRunning ? (
                      <button
                        type="button"
                        onClick={() => setAdjustTarget(p)}
                        title="Click to adjust paid days"
                        className={clsx(
                          "group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition",
                          p.adjustment
                            ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400"
                            : "bg-white border-gray-300 text-gray-700 hover:bg-green-50 hover:border-[#22c55e] hover:text-[#22c55e]",
                        )}
                      >
                        <span className="tabular-nums">{Number(p.paidDays)}/{Number(p.workingDays)}</span>
                        {p.adjustment && (
                          <span className="px-1 py-px rounded-sm bg-amber-200/70 text-amber-900 text-[10px] font-bold uppercase tracking-wide">
                            Adj
                          </span>
                        )}
                        <Pencil size={12} className={clsx(
                          "transition",
                          p.adjustment ? "text-amber-700" : "text-gray-400 group-hover:text-[#22c55e]",
                        )} />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 tabular-nums">
                        {Number(p.paidDays)}/{Number(p.workingDays)}
                        {p.adjustment && (
                          <span
                            title={`Manually adjusted${p.adjustment.reason ? ` — ${p.adjustment.reason}` : ""}`}
                            className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold uppercase tracking-wide"
                          >
                            Adj
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Number(p.grossEarnings))}</td>
                  <td className="py-3 px-3 text-right text-gray-700">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span>₹{INR.format(Number(p.totalDeductions))}</span>
                      {(p.tdsAdjustment || p.tdsRecoveries.length > 0) && (
                        <span
                          title={
                            p.tdsAdjustment
                              ? `TDS overridden: ₹${INR.format(p.tdsAdjustment.originalTds)} → ₹${INR.format(p.tdsAdjustment.overrideTds)}`
                              : `Recovering ₹${INR.format(p.tdsRecoveries.reduce((s, r) => s + r.perMonthAmount, 0))} from prior override`
                          }
                          className={clsx(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1",
                            p.tdsAdjustment
                              ? "bg-purple-50 text-purple-700 ring-purple-200"
                              : "bg-green-50 text-green-700 ring-green-200",
                          )}
                        >
                          {p.tdsAdjustment ? "TDS Adj" : "TDS Rec"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-gray-900 font-semibold">₹{INR.format(Number(p.netPay))}</td>
                  <td className="py-3 px-3">
                    <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded",
                      p.status === "Released" ? "bg-emerald-100 text-emerald-700" :
                      p.status === "Generated" ? "bg-[#dcfce7] text-[#16a34a]" : "bg-gray-100 text-gray-600",
                    )}>{p.status}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {(run.status === "Draft" || run.status === "Processing") && !computeRunning && (
                        <button
                          onClick={() => setTdsTarget(p)}
                          title="Adjust TDS for this month"
                          className={clsx(
                            "px-1.5 py-0.5 rounded ring-1 text-[10px] font-bold transition",
                            p.tdsAdjustment
                              ? "bg-purple-50 text-purple-700 ring-purple-200 hover:bg-purple-100"
                              : "bg-white text-gray-600 ring-gray-200 hover:bg-purple-50 hover:text-purple-700 hover:ring-purple-200",
                          )}
                        >
                          TDS
                        </button>
                      )}
                      <Link href={`/payroll/runs/${run.id}/payslips/${p.id}`} className="text-[#22c55e] hover:underline" title="View detail">
                        <Eye size={12} />
                      </Link>
                      <button
                        onClick={() => downloadPayslipPdf(p.id, p.employee?.firstName ?? "payslip", p.employee?.employeeCode ?? p.id)}
                        className="text-gray-500 hover:text-[#22c55e]"
                        title="Download PDF"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adjustTarget && (
        <AdjustDaysModal
          runId={run.id}
          payslip={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={() => {
            setAdjustTarget(null);
            qc.invalidateQueries({ queryKey: ["payroll", "runs", id, "compute-status"] });
          }}
        />
      )}

      {tdsTarget && (
        <AdjustTdsModal
          runId={run.id}
          payslip={tdsTarget}
          onClose={() => setTdsTarget(null)}
          onSaved={() => {
            setTdsTarget(null);
            qc.invalidateQueries({ queryKey: ["payroll", "runs", id, "compute-status"] });
          }}
        />
      )}

      {confirmAction && (
        <ConfirmActionModal
          action={confirmAction}
          run={run}
          preflight={preflight}
          busy={approveMut.isPending || releaseMut.isPending}
          onClose={() => { setConfirmAction(null); setPreflight(null); }}
          onConfirm={() => {
            if (confirmAction === "approve") approveMut.mutate();
            else toast.promise(releaseMut.mutateAsync(), {
              loading: "Releasing & emailing payslips…",
              success: "Payslips released & emailed",
              error: (e) => (e instanceof Error && e.message ? e.message : "Couldn't release the payslips"),
            });
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "x-tenant-id": "tenant_dev_001",
    "x-user-id": "user_dev_001",
  };
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("hrms.roles");
    const roles = stored?.trim() || "hr_admin,employee";
    headers["x-user-roles"] = roles;
    headers["x-dev-role"] = roles.split(",")[0]?.trim() || "employee";
  }
  return headers;
}

async function downloadPayslipPdf(payslipId: string, firstName: string, code: string) {
  const url = withBasePath(`/api/v1/hrms/payroll/payslips/${payslipId}/pdf`);
  const res = await fetch(url, { headers: buildAuthHeaders() });
  if (!res.ok) {
    const txt = await res.text();
    alert(`Download failed: ${txt}`);
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `payslip-${code}-${firstName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function Form24QButton({
  runId, scope, label, title,
}: {
  runId: string;
  scope: "run" | "quarter";
  label: string;
  title: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const qs = scope === "quarter" ? "?scope=quarter" : "";
      const url = withBasePath(`/api/v1/hrms/payroll/runs/${runId}/form24q${qs}`);
      const res = await fetch(url, { headers: buildAuthHeaders() });
      if (!res.ok) {
        let msg = `Download failed (${res.status})`;
        try {
          const data = await res.json();
          msg = data?.error?.message ?? msg;
        } catch { /* not JSON */ }
        alert(msg);
        return;
      }
      const disp = res.headers.get("content-disposition") ?? "";
      const m = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)/i.exec(disp);
      const filename = m
        ? decodeURIComponent(m[1])
        : `form24q-${scope === "quarter" ? "quarter-" : ""}${runId}.txt`;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title={title}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-700 border border-[var(--border)] rounded-md text-xs font-medium"
    >
      <FileText size={13} /> {loading ? "Preparing…" : label}
    </button>
  );
}

function TaxExcelButton({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = withBasePath(`/api/v1/hrms/payroll/runs/${runId}/tax-export`);
      const res = await fetch(url, { headers: buildAuthHeaders() });
      if (!res.ok) {
        let msg = `Download failed (${res.status})`;
        try {
          const data = await res.json();
          msg = data?.error?.message ?? msg;
        } catch { /* not JSON */ }
        alert(msg);
        return;
      }
      // Prefer filename from Content-Disposition; fall back to a sensible default.
      const disp = res.headers.get("content-disposition") ?? "";
      const m = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)/i.exec(disp);
      const filename = m ? decodeURIComponent(m[1]) : `tax-details-${runId}.xlsx`;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title="Download all tax / statutory contribution details as Excel"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
    >
      <FileSpreadsheet size={13} /> {loading ? "Preparing…" : "Tax Excel"}
    </button>
  );
}

function BankAdviceMenu({ runId }: { runId: string }) {
  const formats: { key: string; label: string }[] = [
    { key: "generic", label: "Generic CSV" },
    { key: "hdfc", label: "HDFC NEFT" },
    { key: "icici", label: "ICICI NEFT" },
    { key: "sbi", label: "SBI Cinb" },
  ];

  const downloadAdvice = async (format: string, label: string) => {
    const url = withBasePath(`/api/v1/hrms/payroll/runs/${runId}/bank-advice?format=${format}`);
    const res = await fetch(url, { headers: buildAuthHeaders() });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Download failed: ${txt}`);
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `bank-advice-${label.toLowerCase().replace(/\s+/g, "-")}-${runId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="relative group">
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-[var(--border)] rounded-md text-xs font-medium">
        <Building2 size={13} /> Bank Advice
      </button>
      <div className="absolute right-0 top-full pt-1 z-20 hidden group-hover:block min-w-[160px]">
        <div className="bg-white rounded-md shadow-lg ring-1 ring-gray-200 overflow-hidden">
          {formats.map((f) => (
            <button
              key={f.key}
              onClick={() => downloadAdvice(f.key, f.label)}
              className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-[#22c55e]"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-3">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function OneTimeEntriesPanel({
  runId, runStatus, entries, onChanged,
}: {
  runId: string;
  runStatus: PayRun["status"];
  entries: OneTimeEntry[];
  onChanged: () => void;
}) {
  const api = useApiClient();
  const editable = runStatus === "Draft" || runStatus === "Processing";

  const pending = entries.filter((e) => e.status === "Pending");
  const approved = entries.filter((e) => e.status === "Approved");
  const applied = entries.filter((e) => e.status === "Applied");
  const rejected = entries.filter((e) => e.status === "Rejected");

  const earningsTotal = entries
    .filter((e) => (e.status === "Approved" || e.status === "Applied") && e.kind !== "Deduction")
    .reduce((s, e) => s + e.amount, 0);
  const deductionsTotal = entries
    .filter((e) => (e.status === "Approved" || e.status === "Applied") && e.kind === "Deduction")
    .reduce((s, e) => s + e.amount, 0);

  const approveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/hrms/payroll/one-time-earnings/${id}`, { status: "Approved" }),
    onSuccess: onChanged,
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/api/v1/hrms/payroll/one-time-earnings/${id}`, { status: "Rejected", rejectionReason: reason }),
    onSuccess: onChanged,
  });

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Gift size={14} className="text-gray-400" />
          No one-time bonuses, arrears, incentives or deductions queued for this period.
        </div>
        <Link
          href="/payroll/one-time-earnings"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#22c55e] hover:underline"
        >
          Add one <ArrowUpRight size={12} />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift size={15} className="text-[#22c55e]" />
          <h2 className="text-[13px] font-semibold text-gray-900">One-time entries for this period</h2>
          <span className="text-[11px] text-gray-500">({entries.length})</span>
        </div>
        <Link
          href="/payroll/one-time-earnings"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#22c55e] hover:underline"
        >
          Manage all <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* Warning banner if anything is still Pending */}
      {pending.length > 0 && editable && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900">
            <b>{pending.length} entry{pending.length === 1 ? "" : "s"} still Pending</b> — they will NOT apply
            to this run unless approved. Recompute after approving.
          </p>
        </div>
      )}

      {/* Mini summary */}
      <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 grid grid-cols-4 gap-3 text-[11px]">
        <div>
          <p className="font-bold text-gray-500 uppercase">Pending</p>
          <p className="text-xs font-bold text-amber-700 mt-0.5">{pending.length}</p>
        </div>
        <div>
          <p className="font-bold text-gray-500 uppercase">Approved (will apply)</p>
          <p className="text-xs font-bold text-green-700 mt-0.5">{approved.length}</p>
        </div>
        <div>
          <p className="font-bold text-gray-500 uppercase">+ Earnings</p>
          <p className="text-xs font-bold text-emerald-700 mt-0.5">₹{INR.format(earningsTotal)}</p>
        </div>
        <div>
          <p className="font-bold text-gray-500 uppercase">- Deductions</p>
          <p className="text-xs font-bold text-red-700 mt-0.5">₹{INR.format(deductionsTotal)}</p>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50/40">
            <th className="text-left py-2 px-3">Employee</th>
            <th className="text-left py-2 px-3">Kind</th>
            <th className="text-left py-2 px-3">Component</th>
            <th className="text-right py-2 px-3">Amount</th>
            <th className="text-left py-2 px-3">Status</th>
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {[...pending, ...approved, ...applied, ...rejected].map((e) => (
            <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/40">
              <td className="py-2 px-3">
                <p className="text-[13px] font-medium text-gray-900">
                  {e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : "—"}
                </p>
                <p className="text-[11px] text-gray-500 font-mono">{e.employee?.employeeCode ?? ""}</p>
              </td>
              <td className="py-2 px-3">
                <KindBadge kind={e.kind} />
              </td>
              <td className="py-2 px-3">
                <p className="text-gray-900">{e.componentName}</p>
                <p className="text-[11px] text-gray-500 font-mono">{e.componentCode}</p>
              </td>
              <td className={clsx(
                "py-2 px-3 text-right font-semibold tabular-nums",
                e.kind === "Deduction" ? "text-red-700" : "text-gray-900",
              )}>
                {e.kind === "Deduction" ? "− " : ""}₹{INR.format(e.amount)}
              </td>
              <td className="py-2 px-3">
                <StatusBadge status={e.status} />
                {e.rejectionReason && <p className="text-[10px] text-red-600 mt-0.5">{e.rejectionReason}</p>}
              </td>
              <td className="py-2 px-3 text-right">
                {e.status === "Pending" && editable && (
                  <div className="inline-flex items-center gap-1">
                    <button
                      title="Approve — will apply on next compute"
                      onClick={() => approveMut.mutate(e.id)}
                      disabled={approveMut.isPending}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      title="Reject"
                      onClick={() => {
                        const r = window.prompt("Rejection reason");
                        if (!r) return;
                        rejectMut.mutate({ id: e.id, reason: r });
                      }}
                      disabled={rejectMut.isPending}
                      className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmActionModal({
  action, run, preflight, busy, onClose, onConfirm,
}: {
  action: "approve" | "release";
  run: PayRun;
  preflight: { totalPayslips: number; missingEmailCount: number; missingEmail: { employeeId: string; employeeCode: string; name: string }[] } | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const tdsOverrides = run.payslips.filter((p) => p.tdsAdjustment);
  const tdsRecoveriesCount = run.payslips.filter((p) => p.tdsRecoveries.length > 0).length;
  const paidDayAdj = run.payslips.filter((p) => p.adjustment);
  const oneTimeApproved = run.oneTimeEarnings.filter((e) => e.status === "Approved" || e.status === "Applied");
  const oneTimePending = run.oneTimeEarnings.filter((e) => e.status === "Pending");

  const totalShortfall = tdsOverrides.reduce((s, p) => s + (p.tdsAdjustment?.shortfall ?? 0), 0);
  const totalRecoveryThisMonth = run.payslips.reduce(
    (s, p) => s + p.tdsRecoveries.reduce((rs, r) => rs + r.perMonthAmount, 0),
    0,
  );
  const oneTimeEarningsAmt = oneTimeApproved.filter((e) => e.kind !== "Deduction").reduce((s, e) => s + e.amount, 0);
  const oneTimeDeductionsAmt = oneTimeApproved.filter((e) => e.kind === "Deduction").reduce((s, e) => s + e.amount, 0);

  const isApprove = action === "approve";
  const title = isApprove ? "Approve this payroll run?" : "Release payslips?";
  const subtitle = isApprove
    ? "Please ensure this approval is completed on time, ideally before the pay date. Once approved, payslips are locked — only Release is allowed, no more edits or recompute."
    : "Releasing emails payslips to employees and marks the run as Paid. This cannot be undone.";

  // Forced 5s read-time before the Approve CTA becomes clickable, so HR
  // can't reflex-click through the confirm dialog.
  const [secondsLeft, setSecondsLeft] = useState(isApprove ? 5 : 0);
  useEffect(() => {
    if (!isApprove || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isApprove, secondsLeft]);
  const locked = isApprove && secondsLeft > 0;

  const ctaLabel = isApprove
    ? busy ? "Approving..." : locked ? `Yes, Approve (${secondsLeft}s)` : "Yes, Approve"
    : busy ? "Releasing..." : (preflight && preflight.missingEmailCount > 0 ? "Release Anyway" : "Yes, Release");
  const ctaColor = isApprove ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className={clsx(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              isApprove ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
            )}>
              {isApprove ? <Check size={18} /> : <Send size={18} />}
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed max-w-md">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {/* Run totals snapshot */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-md bg-gray-50 border border-gray-200 p-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Employees</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">{run.employeeCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Gross</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">₹{INR.format(Number(run.totalGross))}</p>
            </div>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Deductions</p>
              <p className="text-xs font-bold text-red-700 mt-0.5">₹{INR.format(Number(run.totalDeductions))}</p>
            </div>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Net Pay</p>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">₹{INR.format(Number(run.totalNet))}</p>
            </div>
          </div>

          {/* TDS Overrides — shows shortfall + recovery summary */}
          {tdsOverrides.length > 0 && (
            <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                  TDS overrides applied ({tdsOverrides.length})
                </h4>
                <span className="text-[11px] text-purple-700">
                  Total shortfall: <b>₹{INR.format(totalShortfall)}</b>
                </span>
              </div>
              <ul className="text-[11px] text-purple-900 space-y-1.5">
                {tdsOverrides.slice(0, 5).map((p) => {
                  const t = p.tdsAdjustment!;
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-2 border-b border-purple-100 last:border-0 pb-1.5 last:pb-0">
                      <span className="font-medium">
                        {p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "—"}
                      </span>
                      <span className="text-right tabular-nums">
                        ₹{INR.format(t.originalTds)} → ₹{INR.format(t.overrideTds)}
                        {t.shortfall > 0 && (
                          <span className="block text-[10px] text-purple-600">
                            {t.strategy === "NextMonth"
                              ? `Recover ₹${INR.format(t.shortfall)} next month`
                              : `Recover ₹${INR.format(t.perMonthAmount)}/mo × ${t.recoveryMonths} months`}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
                {tdsOverrides.length > 5 && (
                  <li className="text-[10px] text-purple-600 italic">+ {tdsOverrides.length - 5} more</li>
                )}
              </ul>
              <p className="text-[10px] text-purple-700 mt-2">
                Recovery schedule is locked in. Future months will auto-deduct the recovery amounts on top of normal TDS.
              </p>
            </div>
          )}

          {/* TDS Recoveries being applied THIS month */}
          {tdsRecoveriesCount > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50/50 p-3">
              <h4 className="text-xs font-bold text-green-900 uppercase tracking-wide mb-1">
                TDS recoveries applied this month ({tdsRecoveriesCount} employees)
              </h4>
              <p className="text-[11px] text-green-800">
                Total extra TDS this month from prior overrides: <b>₹{INR.format(totalRecoveryThisMonth)}</b>
              </p>
            </div>
          )}

          {/* Paid-day adjustments */}
          {paidDayAdj.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">
                Paid-days manually adjusted ({paidDayAdj.length})
              </h4>
              <ul className="text-[11px] text-amber-900 space-y-0.5">
                {paidDayAdj.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "—"}</span>
                    <span className="tabular-nums">{Number(p.paidDays)}/{Number(p.workingDays)} days</span>
                  </li>
                ))}
                {paidDayAdj.length > 4 && (
                  <li className="text-[10px] text-amber-700 italic">+ {paidDayAdj.length - 4} more</li>
                )}
              </ul>
            </div>
          )}

          {/* One-time entries */}
          {oneTimeApproved.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50/50 p-3">
              <h4 className="text-xs font-bold text-green-900 uppercase tracking-wide mb-1">
                One-time pay & deductions applied ({oneTimeApproved.length})
              </h4>
              <p className="text-[11px] text-green-800">
                Earnings: <b className="text-emerald-700">+ ₹{INR.format(oneTimeEarningsAmt)}</b>
                {oneTimeDeductionsAmt > 0 && (
                  <> · Deductions: <b className="text-red-700">− ₹{INR.format(oneTimeDeductionsAmt)}</b></>
                )}
              </p>
            </div>
          )}

          {oneTimePending.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-900">
                <b>{oneTimePending.length} one-time entry{oneTimePending.length === 1 ? "" : "s"} still Pending.</b>{" "}
                These will NOT apply. Approve or reject them first if you want them on this run.
              </p>
            </div>
          )}

          {/* Release-only: preflight email check */}
          {action === "release" && preflight && preflight.missingEmailCount > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-900">
                  <b>{preflight.missingEmailCount} of {preflight.totalPayslips} employees</b> have no work email — they won&apos;t get the auto-email. PDF is still generated; you can resend later.
                </p>
              </div>
              <ul className="text-[10px] text-amber-800 font-mono pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                {preflight.missingEmail.slice(0, 10).map((r) => (
                  <li key={r.employeeId}>{r.name} ({r.employeeCode})</li>
                ))}
                {preflight.missingEmail.length > 10 && (
                  <li className="italic">+ {preflight.missingEmail.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Nothing-special note */}
          {tdsOverrides.length === 0 && tdsRecoveriesCount === 0 && paidDayAdj.length === 0 && oneTimeApproved.length === 0 && oneTimePending.length === 0 && (
            <div className="text-xs text-gray-500 italic text-center py-2">
              No special adjustments on this run — straight-forward {isApprove ? "approval" : "release"}.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] bg-white hover:bg-gray-50 rounded-md text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || locked}
            onClick={onConfirm}
            className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-md font-medium disabled:opacity-60 disabled:cursor-not-allowed", ctaColor)}
          >
            {isApprove ? <Check size={13} /> : <Send size={13} />} {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustTdsModal({
  runId, payslip, onClose, onSaved,
}: {
  runId: string;
  payslip: Payslip;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApiClient();

  // Computed TDS for this payslip — sum of any line with code "TDS"
  const computedTds = payslip.lines
    .filter((l) => l.componentCode === "TDS")
    .reduce((s, l) => s + Number(l.amount), 0);

  // If this row already has an override, derive the "base" (original) from the override record.
  // Otherwise, the line amount IS the base.
  const baseTds = payslip.tdsAdjustment ? payslip.tdsAdjustment.originalTds : computedTds;
  const currentOverride = payslip.tdsAdjustment ? payslip.tdsAdjustment.overrideTds : computedTds;

  const [overrideTds, setOverrideTds] = useState<string>(String(currentOverride));
  const [strategy, setStrategy] = useState<"NextMonth" | "SpreadOverMonths">(
    payslip.tdsAdjustment?.strategy ?? "SpreadOverMonths",
  );
  const [recoveryMonths, setRecoveryMonths] = useState<number>(
    payslip.tdsAdjustment?.recoveryMonths && payslip.tdsAdjustment.strategy === "SpreadOverMonths"
      ? payslip.tdsAdjustment.recoveryMonths
      : 3,
  );
  const [reason, setReason] = useState<string>(payslip.tdsAdjustment?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const n = Number(overrideTds);
  const validNumber = Number.isFinite(n) && n >= 0;
  const shortfall = validNumber ? Math.round((baseTds - n) * 100) / 100 : 0;
  const willRecover = shortfall > 0;
  const perMonth = willRecover
    ? strategy === "NextMonth"
      ? shortfall
      : Math.round((shortfall / recoveryMonths) * 100) / 100
    : 0;
  const empName = payslip.employee ? `${payslip.employee.firstName} ${payslip.employee.lastName}` : "Employee";

  const save = useMutation({
    mutationFn: () => {
      if (!validNumber) throw new Error("Enter a valid TDS amount");
      return api.patch(
        `/api/v1/hrms/payroll/runs/${runId}/payslips/${payslip.id}/adjust-tds`,
        {
          overrideTds: n,
          strategy,
          recoveryMonths: strategy === "SpreadOverMonths" ? recoveryMonths : 1,
          reason: reason.trim() || null,
        },
      );
    },
    onSuccess: () => onSaved(),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message || "Failed to save TDS adjustment"),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.delete(`/api/v1/hrms/payroll/runs/${runId}/payslips/${payslip.id}/adjust-tds`),
    onSuccess: () => onSaved(),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message || "Failed to reset TDS adjustment"),
  });

  const busy = save.isPending || reset.isPending;
  const changed = n !== currentOverride || strategy !== (payslip.tdsAdjustment?.strategy ?? "SpreadOverMonths")
    || (strategy === "SpreadOverMonths" && recoveryMonths !== (payslip.tdsAdjustment?.recoveryMonths ?? 3));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wide">
                TDS Override
              </span>
              Adjust income-tax for this month
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {empName} {payslip.employee?.employeeCode ? `· ${payslip.employee.employeeCode}` : ""}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {payslip.tdsAdjustment && (
            <div className="text-[11px] text-purple-800 bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
              An override is already in effect: <b>₹{INR.format(payslip.tdsAdjustment.overrideTds)}</b>{" "}
              ({payslip.tdsAdjustment.strategy === "NextMonth"
                ? "lump-sum next month"
                : `spread over ${payslip.tdsAdjustment.recoveryMonths} months`}).
              Saving will replace it.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Calculated TDS</p>
              <p className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">₹{INR.format(baseTds)}</p>
            </div>
            <div className="rounded-md border border-purple-300 bg-purple-50 p-2.5">
              <p className="text-[10px] font-bold text-purple-700 uppercase">Use this month</p>
              <input
                type="number"
                step="1"
                min={0}
                value={overrideTds}
                onChange={(e) => { setError(null); setOverrideTds(e.target.value); }}
                disabled={busy}
                className="w-full mt-0.5 text-base font-bold text-purple-900 bg-transparent border-0 border-b-2 border-purple-400 focus:outline-none focus:border-purple-600 disabled:opacity-60 tabular-nums"
              />
            </div>
          </div>

          {/* Shortfall preview */}
          <div className={clsx(
            "rounded-md border px-3 py-2 text-xs",
            shortfall > 0
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : shortfall < 0
                ? "bg-green-50 border-green-200 text-green-900"
                : "bg-gray-50 border-gray-200 text-gray-600",
          )}>
            {shortfall > 0 && (
              <>
                <p>
                  <b>Shortfall: ₹{INR.format(shortfall)}</b> will be recovered from future months.
                </p>
              </>
            )}
            {shortfall < 0 && (
              <p>
                <b>Excess: ₹{INR.format(Math.abs(shortfall))}</b> deducted this month. No future recovery needed.
              </p>
            )}
            {shortfall === 0 && <p>No change — same as calculated TDS.</p>}
          </div>

          {/* Recovery strategy */}
          {willRecover && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Recovery strategy</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStrategy("NextMonth")}
                  disabled={busy}
                  className={clsx(
                    "px-3 py-2 rounded-md border text-left transition",
                    strategy === "NextMonth"
                      ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                >
                  <p className="text-xs font-bold text-gray-900">Lump-sum next month</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    ₹{INR.format(shortfall)} added to next month&apos;s TDS
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setStrategy("SpreadOverMonths")}
                  disabled={busy}
                  className={clsx(
                    "px-3 py-2 rounded-md border text-left transition",
                    strategy === "SpreadOverMonths"
                      ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                >
                  <p className="text-xs font-bold text-gray-900">Spread over {recoveryMonths} months</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    ₹{INR.format(perMonth)} / month over {recoveryMonths} months
                  </p>
                </button>
              </div>

              {strategy === "SpreadOverMonths" && (
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Months</label>
                  <Select
                    value={String(recoveryMonths)}
                    onChange={(v) => setRecoveryMonths(Number(v))}
                    disabled={busy}
                    size="sm"
                    options={[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => ({ value: String(m), label: String(m) }))}
                  />
                  <span className="text-[10px] text-gray-400">
                    Capped to months remaining in this FY.
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">
              Reason <span className="font-normal text-gray-400">(optional, for audit)</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="e.g. Employee requested lower TDS this month due to a personal need"
              className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>
          )}

          <p className="text-[10px] text-gray-400">
            Saving will trigger a recompute. TDS for this run + recovery schedule for future runs are tracked separately and survive future recomputes.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t border-gray-100 bg-gray-50">
          <div>
            {payslip.tdsAdjustment && (
              <button
                type="button"
                disabled={busy}
                onClick={() => reset.mutate()}
                title="Cancel the override and remaining recovery — natural FY-spread takes over again"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[var(--border)] bg-white hover:bg-gray-50 rounded-md text-gray-700 disabled:opacity-50"
              >
                <RotateCcw size={12} /> {reset.isPending ? "Cancelling..." : "Cancel override"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] bg-white hover:bg-gray-50 rounded-md text-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !changed || !validNumber}
              onClick={() => save.mutate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md font-medium disabled:opacity-50"
            >
              <Check size={13} /> {save.isPending ? "Saving & recomputing..." : "Save & Recompute"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: OneTimeEntry["kind"] }) {
  const isDeduction = kind === "Deduction";
  return (
    <span className={clsx(
      "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
      isDeduction ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-green-50 text-green-700 ring-1 ring-green-100",
    )}>
      {kind.replace(/([a-z])([A-Z])/g, "$1 $2")}
    </span>
  );
}

function StatusBadge({ status }: { status: OneTimeEntry["status"] }) {
  const map: Record<OneTimeEntry["status"], string> = {
    Pending: "bg-amber-100 text-amber-700",
    Approved: "bg-green-100 text-green-700",
    Applied: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-semibold", map[status])}>
      {status}
    </span>
  );
}

function AdjustDaysModal({
  runId, payslip, onClose, onSaved,
}: {
  runId: string;
  payslip: Payslip;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApiClient();
  const workingDays = Number(payslip.workingDays);
  const initialPaid = Number(payslip.paidDays);
  const [paidDays, setPaidDays] = useState<string>(String(initialPaid));
  const [reason, setReason] = useState<string>(payslip.adjustment?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const n = Number(paidDays);
      if (!Number.isFinite(n) || n < 0) throw new Error("Paid days must be a non-negative number");
      if (n > workingDays) throw new Error(`Paid days cannot exceed working days (${workingDays})`);
      return api.patch(
        `/api/v1/hrms/payroll/runs/${runId}/payslips/${payslip.id}/adjust-days`,
        { paidDays: n, reason: reason.trim() || null },
      );
    },
    onSuccess: () => onSaved(),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message || "Failed to save adjustment"),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.delete(`/api/v1/hrms/payroll/runs/${runId}/payslips/${payslip.id}/adjust-days`),
    onSuccess: () => onSaved(),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message || "Failed to reset adjustment"),
  });

  const busy = save.isPending || reset.isPending;
  const n = Number(paidDays);
  const lopPreview = Number.isFinite(n) ? Math.max(0, Math.round((workingDays - n) * 100) / 100) : 0;
  const changed = n !== initialPaid;
  const empName = payslip.employee ? `${payslip.employee.firstName} ${payslip.employee.lastName}` : "Employee";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">Adjust Paid Days</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {empName} {payslip.employee?.employeeCode ? `· ${payslip.employee.employeeCode}` : ""}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {payslip.adjustment && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Currently adjusted to <b>{payslip.adjustment.paidDaysOverride}</b> day(s).
              {payslip.adjustment.reason ? ` Reason: ${payslip.adjustment.reason}` : ""}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase">Working Days</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{workingDays}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase">Paid Days</p>
              <input
                type="number"
                step="0.5"
                min={0}
                max={workingDays}
                value={paidDays}
                onChange={(e) => { setError(null); setPaidDays(e.target.value); }}
                disabled={busy}
                className="w-full mt-0.5 text-base font-bold text-center border-2 border-[#22c55e] rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30 disabled:opacity-60"
              />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase">LOP Days</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{lopPreview}</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">
              Reason <span className="font-normal text-gray-400">(optional, for audit)</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="e.g. Approved comp-off after attendance was already cut"
              className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30 resize-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>
          )}

          <p className="text-[10px] text-gray-400">
            Saving will trigger a recompute. Earnings, deductions and net pay will update within a few seconds. The override survives a full Recompute later.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t border-gray-100 bg-gray-50">
          <div>
            {payslip.adjustment && (
              <button
                type="button"
                disabled={busy}
                onClick={() => reset.mutate()}
                title="Remove the manual override — attendance LOP will take over again"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[var(--border)] bg-white hover:bg-gray-50 rounded-md text-gray-700 disabled:opacity-50"
              >
                <RotateCcw size={12} /> {reset.isPending ? "Resetting..." : "Reset to attendance"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] bg-white hover:bg-gray-50 rounded-md text-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !changed}
              onClick={() => save.mutate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md font-medium disabled:opacity-50"
            >
              <Check size={13} /> {save.isPending ? "Saving & recomputing..." : "Save & Recompute"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
