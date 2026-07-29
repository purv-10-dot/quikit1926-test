"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Wallet, Download, FileText, TrendingUp, TrendingDown, Minus, Info, Loader2, Eye } from "lucide-react";
import { useToast } from "@/components/hrms/toast";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { PdfViewerModal } from "@/components/hrms/pdf-viewer-modal";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { clsx } from "clsx";

interface Payslip {
  id: string;
  periodStart: string;
  periodEnd: string;
  workingDays: string;
  paidDays: string;
  lopDays: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  currency: string;
  status: "Draft" | "Generated" | "Released" | "Failed";
  payRun: { payDate: string; status: string };
}

interface PayslipsRes {
  payslips: Payslip[];
  totals: { grossEarnings: number; totalDeductions: number; netPay: number; tdsDeducted: number; epfEmployee: number; months: number };
}

interface CompRow {
  id: string;
  componentId: string;
  name: string;
  code: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  category: string;
  amountType: "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";
  amountValue: number;
  monthly: number;
  annual: number;
}

interface MySalary {
  ctc: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  structure: { id: string; name: string; code: string } | null;
  monthlyCTC: number;
  fixedAllowanceMonthly: number;
  fixedAllowanceAnnual: number;
  earnings: CompRow[];
  deductions: CompRow[];
  benefits: CompRow[];
}

interface RevisionRow {
  id: string;
  ctc: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  revisionReason: string | null;
  isActive: boolean;
  structure: { id: string; name: string; code: string } | null;
  deltaAmount: number | null;
  deltaPercent: number | null;
}

type Tab = "payslips" | "structure" | "revisions";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function formatCalc(r: CompRow): string {
  switch (r.amountType) {
    case "Fixed": return "Fixed";
    case "PercentOfBasic": return `${r.amountValue}% of Basic`;
    case "PercentOfCTC": return `${r.amountValue}% of CTC`;
    case "PercentOfGross": return `${r.amountValue}% of Gross`;
    case "Formula": return "Formula";
  }
}

export default function MyPayrollPage() {
  const [tab, setTab] = useState<Tab>("payslips");

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-3">
        <Wallet className="text-[#22c55e]" />
        <div>
          <h1 className="text-page-title text-gray-900">My Payslips</h1>
          <p className="text-xs text-gray-500">Your payslips, current salary structure, and revision history.</p>
        </div>
      </div>

      <TabSwitcher
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "payslips", label: "My Payslips" },
          { value: "structure", label: "Salary Structure" },
          { value: "revisions", label: "Revision History" },
        ]}
      />

      {tab === "payslips" && <PayslipsTab />}
      {tab === "structure" && <StructureTab />}
      {tab === "revisions" && <RevisionsTab />}
    </div>
  );
}

function PayslipsTab() {
  const api = useApiClient();
  const toast = useToast();
  const [fy, setFy] = useState(currentFY());
  // Per-row download state. Set membership = "this payslip's PDF is fetching".
  // Routed through the api client so the dev auth headers actually get sent —
  // a plain <a href> can't carry them and the route returns UNAUTHORIZED.
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  // In-app PDF viewer — opens the payslip in a modal instead of navigating the
  // tab to a bare blob URL (which strands the user with no way back).
  const [viewer, setViewer] = useState<{ url: string; title: string; fileName: string } | null>(null);

  const viewPdf = (p: Payslip) => {
    const period = new Date(p.periodStart).toLocaleString("en-IN", { month: "short", year: "numeric" }).replace(/\s+/g, "-");
    setViewer({
      url: `/api/v1/hrms/payroll/payslips/${p.id}/pdf`,
      title: `Payslip — ${new Date(p.periodStart).toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
      fileName: `Payslip-${period}.pdf`,
    });
  };

  const downloadPdf = async (p: Payslip) => {
    setDownloading((s) => new Set(s).add(p.id));
    try {
      const period = new Date(p.periodStart).toLocaleString("en-IN", { month: "short", year: "numeric" }).replace(/\s+/g, "-");
      await api.download(
        `/api/v1/hrms/payroll/payslips/${p.id}/pdf`,
        `Payslip-${period}.pdf`,
      );
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setDownloading((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "my-payslips", fy],
    queryFn: () => api.get<PayslipsRes>(`/api/v1/hrms/payroll/my-payslips?fy=${fy}`),
  });
  const res = data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select
          value={fy}
          onChange={(v) => setFy(v)}
          options={Array.from({ length: 5 }, (_, i) => {
            const y = new Date().getFullYear() - i;
            const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
            return { value: label, label: `FY ${label}` };
          })}
          className="w-36"
        />
      </div>

      {res && res.totals.months > 0 && (
        <div className="grid grid-cols-5 gap-3">
          <KPI label="Months Paid" value={String(res.totals.months)} icon={<FileText size={14} />} />
          <KPI label="YTD Gross" value={`₹${INR.format(res.totals.grossEarnings)}`} icon={<TrendingUp size={14} />} />
          <KPI label="YTD Deductions" value={`₹${INR.format(res.totals.totalDeductions)}`} />
          <KPI label="YTD TDS" value={`₹${INR.format(res.totals.tdsDeducted)}`} />
          <KPI label="YTD Net Pay" value={`₹${INR.format(res.totals.netPay)}`} highlight />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">Payslip History — FY {fy}</h2>
          <Link href={`/payroll/claims-declarations`} className="text-xs text-[#22c55e] hover:underline">
            Submit IT declaration / claims →
          </Link>
        </div>
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : !res || res.payslips.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">No payslips for FY {fy}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Month</th>
                <th className="text-left py-2 px-3">Pay Date</th>
                <th className="text-right py-2 px-3">Days</th>
                <th className="text-right py-2 px-3">Gross</th>
                <th className="text-right py-2 px-3">Deductions</th>
                <th className="text-right py-2 px-3">Net Pay</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {res.payslips.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-medium text-gray-900">
                    {new Date(p.periodStart).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                  </td>
                  <td className="py-2 px-3 text-gray-700">{new Date(p.payRun.payDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-2 px-3 text-right text-gray-700">{Number(p.paidDays)}/{Number(p.workingDays)}</td>
                  <td className="py-2 px-3 text-right text-gray-900">₹{INR.format(Number(p.grossEarnings))}</td>
                  <td className="py-2 px-3 text-right text-gray-700">₹{INR.format(Number(p.totalDeductions))}</td>
                  <td className="py-2 px-3 text-right text-gray-900 font-semibold">₹{INR.format(Number(p.netPay))}</td>
                  <td className="py-2 px-3">
                    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-semibold",
                      p.status === "Released" ? "bg-emerald-100 text-emerald-700" :
                      p.status === "Generated" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => viewPdf(p)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 rounded"
                      >
                        <Eye size={12} /> View
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPdf(p)}
                        disabled={downloading.has(p.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded"
                      >
                        {downloading.has(p.id) ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {downloading.has(p.id) ? "Downloading…" : "PDF"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PdfViewerModal
        open={!!viewer}
        url={viewer?.url ?? null}
        title={viewer?.title}
        fileName={viewer?.fileName}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}

function StructureTab() {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "my-salary"],
    queryFn: () => api.get<MySalary | null>("/api/v1/hrms/payroll/my-salary"),
  });

  const s = data?.data;

  if (isLoading) {
    return <div className="rounded-lg border border-gray-200 bg-white p-4"><SkeletonTable rows={6} cols={4} /></div>;
  }
  if (!s) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-xs text-gray-500">
        No active salary structure assigned. Contact HR.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Annual CTC" value={`₹${INR.format(s.ctc)}`} highlight />
        <KPI label="Monthly CTC" value={`₹${INR.format(Math.round(s.monthlyCTC))}`} />
        <KPI label="Effective From" value={new Date(s.effectiveFrom).toLocaleDateString("en-IN")} />
      </div>

      {s.structure && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Info size={12} /> Template: <span className="font-medium text-gray-700">{s.structure.name}</span>
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded ml-1">{s.structure.code}</span>
        </p>
      )}

      <Section title="Earnings" rows={s.earnings} fixedAllowance={{ monthly: s.fixedAllowanceMonthly, annual: s.fixedAllowanceAnnual }} />
      {s.deductions.length > 0 && <Section title="Deductions" rows={s.deductions} />}
      {s.benefits.length > 0 && <Section title="Benefits" rows={s.benefits} />}
    </div>
  );
}

function RevisionsTab() {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "my-salary-history"],
    queryFn: () => api.get<RevisionRow[]>("/api/v1/hrms/payroll/my-salary/history"),
  });

  const rows = data?.data ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {isLoading ? (
        <div className="p-4"><SkeletonTable rows={4} cols={5} /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-500">No salary records yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider bg-gray-50/60 border-b border-gray-200">
              <th className="text-left py-2 px-3">Effective From</th>
              <th className="text-left py-2 px-3">Effective To</th>
              <th className="text-right py-2 px-3">Annual CTC</th>
              <th className="text-right py-2 px-3">Change</th>
              <th className="text-left py-2 px-3">Template</th>
              <th className="text-left py-2 px-3">Reason</th>
              <th className="text-left py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.deltaAmount;
              const pct = r.deltaPercent;
              const isFirst = delta == null;
              const positive = (delta ?? 0) > 0;
              const negative = (delta ?? 0) < 0;
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="py-2.5 px-3 font-medium text-gray-900">
                    {new Date(r.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">
                    {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-900 font-semibold">₹{INR.format(r.ctc)}</td>
                  <td className="py-2.5 px-3 text-right">
                    {isFirst ? (
                      <span className="text-xs text-gray-400">Initial</span>
                    ) : (
                      <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold",
                        positive ? "text-emerald-700" : negative ? "text-red-600" : "text-gray-500")}>
                        {positive ? <TrendingUp size={12} /> : negative ? <TrendingDown size={12} /> : <Minus size={12} />}
                        {positive ? "+" : ""}₹{INR.format(Math.abs(delta!))}
                        {pct != null && <span className="text-gray-500 font-normal">({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">
                    {r.structure ? (
                      <div className="flex items-center gap-2">
                        <span>{r.structure.name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded">{r.structure.code}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">{r.revisionReason ?? "—"}</td>
                  <td className="py-2.5 px-3">
                    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-semibold",
                      r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")}>
                      {r.isActive ? "Active" : "Past"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Section({ title, rows, fixedAllowance }: { title: string; rows: CompRow[]; fixedAllowance?: { monthly: number; annual: number } }) {
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0) + (fixedAllowance?.monthly ?? 0);
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider bg-gray-50/60 border-b border-gray-200">
            <th className="text-left py-2 px-3 w-2/5">Component</th>
            <th className="text-left py-2 px-3">Calculation</th>
            <th className="text-right py-2 px-3">Monthly</th>
            <th className="text-right py-2 px-3 pr-5">Annual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">{r.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded">{r.code}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-gray-700">{formatCalc(r)}</td>
              <td className="py-2.5 px-3 text-right text-gray-900">₹{INR.format(Math.round(r.monthly))}</td>
              <td className="py-2.5 px-3 text-right pr-5 text-gray-900">₹{INR.format(Math.round(r.annual))}</td>
            </tr>
          ))}
          {fixedAllowance && (
            <tr className="border-b border-gray-50">
              <td className="py-2.5 px-3 text-gray-900 font-medium">Fixed Allowance</td>
              <td className="py-2.5 px-3 text-gray-600">Balance to CTC</td>
              <td className="py-2.5 px-3 text-right text-gray-900">₹{INR.format(Math.round(fixedAllowance.monthly))}</td>
              <td className="py-2.5 px-3 text-right pr-5 text-gray-900">₹{INR.format(Math.round(fixedAllowance.annual))}</td>
            </tr>
          )}
          <tr className="bg-[#dcfce7]/60 font-semibold">
            <td className="py-2.5 px-3 text-gray-900">Total {title}</td>
            <td />
            <td className="py-2.5 px-3 text-right text-gray-900">₹{INR.format(Math.round(totalMonthly))}</td>
            <td className="py-2.5 px-3 text-right pr-5 text-gray-900">₹{INR.format(Math.round(totalMonthly * 12))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function KPI({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={clsx("rounded-md border p-3", highlight ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200" : "border-gray-200 bg-gradient-to-b from-gray-50/50 to-white")}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-gray-400">{icon}</span>}
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={clsx("text-sm font-bold mt-0.5", highlight ? "text-emerald-700" : "text-gray-900")}>{value}</p>
    </div>
  );
}
