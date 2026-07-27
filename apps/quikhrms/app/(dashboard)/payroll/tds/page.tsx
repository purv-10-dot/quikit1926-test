"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select } from "@/components/hrms/ui/select";
import {
  Receipt, FileText, Plus, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock,
  ChevronDown, Building2, Calendar, IndianRupee,
} from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { RecordChallanModal } from "./_record-challan-modal";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TabKey = "liability" | "challans";
type PeriodStatus = "Pending" | "Overdue" | "Partial" | "Paid" | "Excess";
type ChallanStatus = "Recorded" | "PartiallyAllocated" | "FullyAllocated";

interface LiabilityPeriod {
  id: string;
  periodYear: number;
  periodMonth: number;
  natureOfPayment: string;
  totalDeducted: string | number;
  totalAllocated: string | number;
  employeeCount: number;
  dueDate: string;
  status: PeriodStatus;
}
interface LiabilityResponse {
  periods: LiabilityPeriod[];
  summary: { totalDeducted: number; totalAllocated: number; pending: number; overdueCount: number };
}

interface Challan {
  id: string;
  cin: string;
  bsrCode: string;
  challanSerial: string;
  depositDate: string;
  assessmentYear: string;
  natureOfPayment: string;
  tanNumber: string;
  basicTax: string | number;
  totalAmount: string | number;
  remainingAmount: string | number;
  paymentMode: string;
  bankName: string | null;
  status: ChallanStatus;
  allocations: {
    id: string;
    allocatedAmount: string | number;
    period: { periodYear: number; periodMonth: number };
  }[];
}
interface ChallanResponse {
  challans: Challan[];
  summary: { count: number; totalDeposited: number; totalUnallocated: number };
}

const STATUS_META: Record<PeriodStatus, { label: string; pill: string; icon: React.ReactNode }> = {
  Pending:  { label: "Pending",  pill: "bg-gray-100 text-gray-700",      icon: <Clock size={11} /> },
  Overdue:  { label: "Overdue",  pill: "bg-red-100 text-red-700",        icon: <AlertTriangle size={11} /> },
  Partial:  { label: "Partial",  pill: "bg-amber-100 text-amber-700",    icon: <AlertTriangle size={11} /> },
  Paid:     { label: "Paid",     pill: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={11} /> },
  Excess:   { label: "Excess",   pill: "bg-green-100 text-green-700",      icon: <AlertTriangle size={11} /> },
};

function currentFY(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const fyStart = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${fyStart}-${(fyStart + 1) % 100}`.replace(/-(\d)$/, "-0$1");
}

export default function TdsPage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonLine w="40%" h={20} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <TdsPageInner />
    </Suspense>
  );
}

function TdsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = (searchParams.get("tab") as TabKey) || "liability";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [fy, setFy] = useState(searchParams.get("fy") || currentFY());
  const [recordingForPeriod, setRecordingForPeriod] = useState<LiabilityPeriod | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const switchTab = (k: TabKey) => {
    setTab(k);
    router.replace(`${pathname}?tab=${k}&fy=${fy}`, { scroll: false });
  };

  return (
    <div className="w-full space-y-4">
      {/* Hero */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt size={28} className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">TDS &amp; Challans</h1>
            <p className="text-xs text-gray-500">
              Monthly TDS deducted from payroll, deposit challans recorded by Finance, and how they reconcile.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FySelector value={fy} onChange={(v) => { setFy(v); router.replace(`${pathname}?tab=${tab}&fy=${v}`, { scroll: false }); }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-100">
        <TabPill active={tab === "liability"} onClick={() => switchTab("liability")} label="TDS Liability" icon={<IndianRupee size={13} />} />
        <TabPill active={tab === "challans"} onClick={() => switchTab("challans")} label="Challans" icon={<FileText size={13} />} />
      </div>

      {tab === "liability"
        ? (
          <LiabilityTab
            fy={fy}
            onRecordChallan={(p) => { setRecordingForPeriod(p); setShowRecordModal(true); }}
          />
        )
        : (
          <ChallansTab
            fy={fy}
            onNewChallan={() => { setRecordingForPeriod(null); setShowRecordModal(true); }}
          />
        )}

      {/* Record Challan modal — shared by both tabs */}
      <RecordChallanModal
        open={showRecordModal}
        onClose={() => { setShowRecordModal(false); setRecordingForPeriod(null); }}
        defaultPeriod={recordingForPeriod
          ? {
              periodYear: recordingForPeriod.periodYear,
              periodMonth: recordingForPeriod.periodMonth,
              pendingAmount: Math.max(0, Number(recordingForPeriod.totalDeducted) - Number(recordingForPeriod.totalAllocated)),
            }
          : null}
      />
    </div>
  );
}

function TabPill({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition",
        active ? "bg-white text-[#166534] shadow-sm ring-1 ring-gray-200" : "text-gray-600 hover:text-[#166534] hover:bg-white/60",
      )}
    >
      {icon} {label}
    </button>
  );
}

function FySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Last 5 FYs.
  const now = new Date();
  const baseY = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const options = Array.from({ length: 5 }, (_, i) => {
    const y = baseY - i;
    const v = `${y}-${((y + 1) % 100).toString().padStart(2, "0")}`;
    return { value: v, label: `FY ${v}` };
  });
  return <div className="w-40"><Select value={value} onChange={onChange} options={options} /></div>;
}

/* ────────────────────── Liability tab ────────────────────── */

function LiabilityTab({ fy, onRecordChallan }: { fy: string; onRecordChallan: (p: LiabilityPeriod) => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["tds", "liability", fy],
    queryFn: () => api.get<LiabilityResponse>(`/api/v1/hrms/payroll/tds/liability?fy=${fy}`),
  });
  const periods = data?.data?.periods ?? [];
  const summary = data?.data?.summary;

  const recomputeMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/payroll/tds/liability/recompute", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tds", "liability"] });
      toast.success("Liability refreshed");
    },
  });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Deducted (FY)" value={summary?.totalDeducted ?? 0} tint="blue" />
        <StatCard label="Deposited (FY)" value={summary?.totalAllocated ?? 0} tint="emerald" />
        <StatCard label="Pending liability" value={summary?.pending ?? 0} tint={summary && summary.pending > 0 ? "amber" : "gray"} />
        <StatCard label="Overdue periods" value={summary?.overdueCount ?? 0} tint={summary && summary.overdueCount > 0 ? "red" : "gray"} isCount />
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Periods refresh automatically when a pay run is released. Use Recompute if you back-dated a payslip.
        </p>
        <button
          type="button"
          onClick={() => recomputeMut.mutate()}
          disabled={recomputeMut.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={12} className={clsx(recomputeMut.isPending && "animate-spin")} />
          {recomputeMut.isPending ? "Refreshing…" : "Recompute"}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-xs text-gray-500">Loading…</div>
        ) : periods.length === 0 ? (
          <EmptyState
            title="No liability periods yet"
            body="A period row gets created when a pay run is released. Release a payroll first, then return here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-table-head uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Period</th>
                <th className="text-right px-4 py-3">Deducted</th>
                <th className="text-right px-4 py-3">Deposited</th>
                <th className="text-right px-4 py-3">Pending</th>
                <th className="text-left px-4 py-3">Due by</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 w-44">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map((p) => {
                const deducted = Number(p.totalDeducted);
                const allocated = Number(p.totalAllocated);
                const pending = Math.max(0, deducted - allocated);
                const meta = STATUS_META[p.status];
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-medium text-gray-900">
                        {MONTHS[p.periodMonth - 1]} {String(p.periodYear).slice(-2)}
                      </div>
                      <div className="text-[11px] text-gray-500">{p.employeeCount} employee{p.employeeCount === 1 ? "" : "s"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">₹{INR.format(deducted)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">₹{INR.format(allocated)}</td>
                    <td className={clsx("px-4 py-2.5 text-right font-bold tabular-nums", pending > 0 ? "text-amber-700" : "text-gray-400")}>
                      ₹{INR.format(pending)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {new Date(p.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium", meta.pill)}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {pending > 0 ? (
                        <button
                          type="button"
                          onClick={() => onRecordChallan(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal text-emerald-700 hover:bg-emerald-50"
                        >
                          <Plus size={12} /> Record challan
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── Challans tab ────────────────────── */

function ChallansTab({ fy, onNewChallan }: { fy: string; onNewChallan: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();

  const { data, isLoading } = useQuery({
    queryKey: ["tds", "challans", fy],
    queryFn: () => api.get<ChallanResponse>(`/api/v1/hrms/payroll/tds/challans?fy=${fy}`),
  });
  const challans = data?.data?.challans ?? [];
  const summary = data?.data?.summary;

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/payroll/tds/challans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tds", "challans"] });
      qc.invalidateQueries({ queryKey: ["tds", "liability"] });
      toast.success("Challan deleted");
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Challans (FY)" value={summary?.count ?? 0} tint="blue" isCount />
        <StatCard label="Deposited (FY)" value={summary?.totalDeposited ?? 0} tint="emerald" />
        <StatCard label="Unallocated" value={summary?.totalUnallocated ?? 0} tint={summary && summary.totalUnallocated > 0 ? "amber" : "gray"} />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onNewChallan}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
        >
          <Plus size={13} /> Record challan
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-xs text-gray-500">Loading…</div>
        ) : challans.length === 0 ? (
          <EmptyState
            title="No challans recorded yet"
            body="After paying TDS to the government via bank, click Record Challan to log the deposit and allocate it to the period it covers."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-table-head uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">CIN</th>
                <th className="text-left px-4 py-3">Deposit</th>
                <th className="text-left px-4 py-3">Bank</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Allocated to</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {challans.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[12px] font-semibold text-gray-900">{c.cin}</div>
                    <div className="text-[11px] text-gray-500">BSR {c.bsrCode} · #{c.challanSerial}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {new Date(c.depositDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    <div className="text-[10px] text-gray-400">AY {c.assessmentYear}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">
                    <div className="inline-flex items-center gap-1"><Building2 size={10} /> {c.bankName ?? "—"}</div>
                    <div className="text-[10px] text-gray-400">{c.paymentMode}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">₹{INR.format(Number(c.totalAmount))}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">
                    {c.allocations.length === 0 ? (
                      <span className="text-gray-400">Unallocated</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.allocations.map((a) => (
                          <span key={a.id} className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-semibold">
                            {MONTHS[a.period.periodMonth - 1]} {String(a.period.periodYear).slice(-2)} · ₹{INR.format(Number(a.allocatedAmount))}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <ChallanStatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await dialog.confirm({
                          title: `Delete challan ${c.cin}?`,
                          description: "This frees up the allocated amounts on the linked liability periods. Use only for mistakenly entered challans — never for already-filed quarters.",
                          variant: "danger",
                          confirmLabel: "Delete",
                        });
                        if (ok) deleteMut.mutate(c.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ChallanStatusPill({ status }: { status: ChallanStatus }) {
  const map: Record<ChallanStatus, { label: string; cls: string }> = {
    Recorded:           { label: "Unallocated",  cls: "bg-gray-100 text-gray-700" },
    PartiallyAllocated: { label: "Partial",      cls: "bg-amber-100 text-amber-700" },
    FullyAllocated:     { label: "Allocated",    cls: "bg-emerald-100 text-emerald-700" },
  };
  const m = map[status];
  return <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", m.cls)}>{m.label}</span>;
}

/* ────────────────────── Small atoms ────────────────────── */

function StatCard({ label, value, tint, isCount }: {
  label: string;
  value: number;
  tint: "blue" | "emerald" | "amber" | "red" | "gray";
  isCount?: boolean;
}) {
  const tintMap: Record<typeof tint, string> = {
    blue: "bg-green-50 text-green-700 ring-green-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100",
    gray: "bg-gray-50 text-gray-700 ring-gray-200",
  };
  return (
    <div className={clsx("rounded-xl ring-1 p-4", tintMap[tint])}>
      <p className="text-[10px] uppercase font-bold tracking-wider">{label}</p>
      <p className="font-serif-display text-xl font-bold mt-1 tabular-nums">
        {isCount ? value : `₹${INR.format(value)}`}
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-12 text-center px-5">
      <Calendar size={28} className="text-gray-300 mx-auto mb-2" />
      <p className="text-[13px] font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}
