"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { useToast } from "@/components/hrms/toast";
import { FileBadge, Download, Eye, AlertCircle, Loader2, X } from "lucide-react";
import { SkeletonTable, SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

interface Summary {
  employeeId: string;
  employee: {
    employeeCode: string;
    name: string;
    pan: string | null;
    department: string | null;
    designation: string | null;
  };
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  epfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  tdsDeducted: number;
  monthsProcessed: number;
}

interface Form16Res {
  financialYear: string;
  employeeCount: number;
  summaries: Summary[];
}

interface PartB {
  employer: { name: string | null; pan: string | null; address: string | null };
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    pan: string | null;
    department: string | null;
    designation: string | null;
    dateOfJoining: string;
  };
  financialYear: string;
  assessmentYear: string;
  regime: "OldRegime" | "NewRegime";
  salary: {
    grossSalary: number;
    standardDeduction: number;
    exemptAllowances: number;
    professionalTax: number;
    netSalary: number;
  };
  chapterVIA: {
    section80C: number;
    section80D: number;
    section80E: number;
    section80G: number;
    section80TTA: number;
    nps80CCD1B: number;
    homeLoanInterest: number;
    total: number;
  } | null;
  tax: {
    taxableIncome: number;
    baseTax: number;
    rebate87A: number;
    taxAfterRebate: number;
    surcharge: number;
    educationCess: number;
    totalTaxLiability: number;
  };
  tds: {
    totalDeducted: number;
    balanceDue: number;
    refundDue: number;
    monthly: { month: string; grossPaid: number; tdsDeducted: number }[];
  };
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr = (n: number) => `₹${INR.format(Math.round(n))}`;

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

export default function Form16Page() {
  const api = useApiClient();
  const toast = useToast();
  const [fy, setFy] = useState(currentFY());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewTarget, setViewTarget] = useState<Summary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "form16", fy],
    queryFn: () => api.get<Form16Res>(`/api/v1/hrms/payroll/form16?fy=${fy}`),
  });

  const res = data?.data;

  const downloadAll = async () => {
    if (!res || res.summaries.length === 0) return;
    setBulkBusy(true);
    try {
      await api.download(
        `/api/v1/hrms/payroll/form16/bulk-pdf?fy=${encodeURIComponent(fy)}`,
        `Form16-PartB-FY${fy}.zip`,
      );
      toast.success("Bulk Tax Computation downloaded", `ZIP with ${res.summaries.length} PDFs`);
    } catch (e) {
      toast.error("Bulk download failed", (e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileBadge className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">Tax computation</h1>
            <p className="text-xs text-gray-500">FY-end TDS certificate (Form 16) — Part A (TRACES) + Part B (salary breakup).</p>
          </div>
        </div>
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

      <div className="rounded-md border border-[#dcfce7] bg-[#dcfce7] px-4 py-3 text-xs text-[#15803d] flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">About Tax computation (Form 16)</p>
          <p className="mt-1">
            Part A (TRACES-certified TDS summary) must be downloaded from TRACES portal after quarterly TDS return (Form 24Q) filing.
            Part B is generated here from released payslips — salary breakup, exemptions, deductions under Chapter VI-A, TDS deducted.
            Issue to employees by 15 June of FY following the relevant FY.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-900">Part B Summary — FY {fy}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading ? "Loading..." : res ? `${res.employeeCount} employees with released payslips in this FY.` : "—"}
          </p>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={6} cols={5} /></div>
        ) : !res || res.summaries.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            No released payroll data for FY {fy} yet. Run and release pay runs to populate the tax computation.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">PAN</th>
                <th className="text-right py-2 px-3">Months</th>
                <th className="text-right py-2 px-3">Gross</th>
                <th className="text-right py-2 px-3">EPF</th>
                <th className="text-right py-2 px-3">PT</th>
                <th className="text-right py-2 px-3">TDS</th>
                <th className="text-right py-2 px-3">Net Paid</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {res.summaries.map((s, i) => (
                <tr key={s.employeeId} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{s.employee.name}</p>
                    <p className="text-xs text-gray-500">{s.employee.employeeCode} · {s.employee.department ?? "—"}</p>
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-gray-700">{s.employee.pan ?? <span className="text-red-500">— Missing —</span>}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{s.monthsProcessed}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(s.grossEarnings)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">₹{INR.format(s.epfEmployee)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">₹{INR.format(s.professionalTax)}</td>
                  <td className="py-3 px-3 text-right text-gray-900 font-semibold">₹{INR.format(s.tdsDeducted)}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(s.netPay)}</td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => setViewTarget(s)}
                      disabled={!s.employee.pan}
                      title={!s.employee.pan ? "Employee PAN missing" : "View tax computation (Form 16 Part B)"}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                    >
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <p className="text-xs text-gray-500">
            Generate consolidated PDFs for all employees, or download per-employee tax computation.
          </p>
          <button
            onClick={downloadAll}
            disabled={bulkBusy || !res || res.summaries.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium"
          >
            {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {bulkBusy ? "Downloading…" : "Generate Bulk Tax Computation (PDF)"}
          </button>
        </div>
      </div>

      {viewTarget && (
        <TaxComputationModal
          fy={fy}
          employeeId={viewTarget.employeeId}
          fallbackName={viewTarget.employee.name}
          fallbackCode={viewTarget.employee.employeeCode}
          onClose={() => setViewTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tax Computation Modal — Form 16 Part B layout, head-to-head
// ---------------------------------------------------------------------------

function TaxComputationModal({
  fy, employeeId, fallbackName, fallbackCode, onClose,
}: {
  fy: string;
  employeeId: string;
  fallbackName: string;
  fallbackCode: string;
  onClose: () => void;
}) {
  const api = useApiClient();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["form16-detail", fy, employeeId],
    queryFn: () => api.get<PartB>(`/api/v1/hrms/payroll/form16?fy=${encodeURIComponent(fy)}&employeeId=${encodeURIComponent(employeeId)}`),
  });

  const partB = data?.data;

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      await api.download(
        `/api/v1/hrms/payroll/form16/pdf?fy=${encodeURIComponent(fy)}&employeeId=${encodeURIComponent(employeeId)}`,
        `Form16-PartB-${partB?.employee.employeeCode ?? fallbackCode}-FY${fy}.pdf`,
      );
    } catch (e) {
      toast.error("PDF download failed", (e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  // Derive the head-to-head amounts. Trust API for taxable + tax totals; we
  // only re-show the upstream pieces so the table reads top-to-bottom.
  const grossSalary = partB?.salary.grossSalary ?? 0;
  const exemptAllowances = partB?.salary.exemptAllowances ?? 0;
  const standardDeduction = partB?.salary.standardDeduction ?? 0;
  const professionalTax = partB?.salary.professionalTax ?? 0;
  const incomeChargeable = partB?.salary.netSalary ?? 0;
  // Income from house property / other sources are not currently captured by
  // the payroll pipeline — surfaced as zero placeholders to keep the Form 16
  // layout complete and to flag the rows that would aggregate declarations later.
  const housePropertyIncome = 0;
  const otherSourcesIncome = 0;
  const grossTotalIncome = incomeChargeable + housePropertyIncome + otherSourcesIncome;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-[#f8fafc] to-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
              <FileBadge size={18} />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-gray-900">Form 16 — Part B (Tax Computation)</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {partB?.employee.name ?? fallbackName} · FY {fy}
                {partB && ` · AY ${partB.assessmentYear} · ${partB.regime === "OldRegime" ? "Old Regime" : "New Regime"}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <div className="space-y-2">
              <SkeletonLine w="60%" h={14} />
              <SkeletonLine w="80%" h={12} />
              <SkeletonLine w="70%" h={12} />
              <SkeletonLine w="50%" h={12} />
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Failed to load tax computation: {(error as Error)?.message ?? "unknown error"}
            </div>
          )}

          {partB && (
            <>
              {/* Employer / Employee identity card */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Employer</p>
                  <p className="text-[13px] font-semibold text-gray-900">{partB.employer.name ?? "—"}</p>
                  <p className="text-[11px] text-gray-600">PAN: <span className="font-mono">{partB.employer.pan ?? "—"}</span></p>
                  {partB.employer.address && <p className="text-[11px] text-gray-500 mt-1">{partB.employer.address}</p>}
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Employee</p>
                  <p className="text-[13px] font-semibold text-gray-900">{partB.employee.name}</p>
                  <p className="text-[11px] text-gray-600">PAN: <span className="font-mono">{partB.employee.pan ?? "—"}</span> · {partB.employee.employeeCode}</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {partB.employee.designation ?? "—"} · {partB.employee.department ?? "—"}
                  </p>
                </div>
              </div>

              {/* Income build-up */}
              <Section title="A. Income">
                <Row label="Gross Salary u/s 17(1)" value={inr(grossSalary)} />
                <Row label="Less: Allowances exempt u/s 10 (HRA, LTA, etc.)" value={`(${inr(exemptAllowances)})`} muted />
                <Row label="Less: Standard Deduction u/s 16(ia)" value={`(${inr(standardDeduction)})`} muted />
                <Row label="Less: Tax on Employment (Professional Tax) u/s 16(iii)" value={`(${inr(professionalTax)})`} muted />
                <Row label="Income chargeable under the head 'Salaries'" value={inr(incomeChargeable)} bold subtotal />
                <Row label="Add: Income / (Loss) from House Property u/s 24(b)" value={inr(housePropertyIncome)} placeholder />
                <Row label="Add: Income from Other Sources" value={inr(otherSourcesIncome)} placeholder />
                <Row label="Gross Total Income" value={inr(grossTotalIncome)} bold total />
              </Section>

              {/* Chapter VI-A — only meaningful in old regime */}
              {partB.chapterVIA ? (
                <Section title="B. Deductions under Chapter VI-A">
                  <Row label="Section 80C (LIC, PPF, ELSS, etc.)" value={inr(partB.chapterVIA.section80C)} />
                  <Row label="Section 80CCD(1B) — NPS additional" value={inr(partB.chapterVIA.nps80CCD1B)} />
                  <Row label="Section 80D — Medical Insurance" value={inr(partB.chapterVIA.section80D)} />
                  <Row label="Section 80E — Education Loan Interest" value={inr(partB.chapterVIA.section80E)} />
                  <Row label="Section 80G — Donations" value={inr(partB.chapterVIA.section80G)} />
                  <Row label="Section 80TTA — Savings Interest" value={inr(partB.chapterVIA.section80TTA)} />
                  <Row label="Section 24(b) — Home Loan Interest" value={inr(partB.chapterVIA.homeLoanInterest)} />
                  <Row label="Aggregate Deductions under Chapter VI-A" value={inr(partB.chapterVIA.total)} bold total />
                </Section>
              ) : (
                <Section title="B. Deductions under Chapter VI-A">
                  <p className="text-[11px] text-gray-500 italic px-3 py-2">
                    New Regime selected — Chapter VI-A deductions (80C / 80D / 80G / etc.) are not allowed.
                  </p>
                </Section>
              )}

              {/* Taxable income */}
              <Section title="C. Total Taxable Income" tone="amber">
                <Row label="Gross Total Income" value={inr(grossTotalIncome)} />
                {partB.chapterVIA && <Row label="Less: Chapter VI-A deductions" value={`(${inr(partB.chapterVIA.total)})`} muted />}
                <Row label="Total Taxable Income" value={inr(partB.tax.taxableIncome)} bold total />
              </Section>

              {/* Tax liability */}
              <Section title="D. Tax Liability" tone="rose">
                <Row label="Tax on Total Income (slab rates)" value={inr(partB.tax.baseTax)} />
                <Row label="Less: Rebate u/s 87A" value={`(${inr(partB.tax.rebate87A)})`} muted />
                <Row label="Tax after Rebate" value={inr(partB.tax.taxAfterRebate)} />
                <Row label="Add: Surcharge" value={inr(partB.tax.surcharge)} />
                <Row label="Add: Health & Education Cess @ 4%" value={inr(partB.tax.educationCess)} />
                <Row label="Total Tax Liability" value={inr(partB.tax.totalTaxLiability)} bold total />
              </Section>

              {/* TDS settlement */}
              <Section title="E. Tax Deducted & Balance" tone="emerald">
                <Row label="Total Tax Liability" value={inr(partB.tax.totalTaxLiability)} />
                <Row label="Less: TDS Deducted from Salary (FY total)" value={`(${inr(partB.tds.totalDeducted)})`} muted />
                {partB.tds.balanceDue > 0 && (
                  <Row label="Tax Remaining (Balance Payable)" value={inr(partB.tds.balanceDue)} bold total tone="rose" />
                )}
                {partB.tds.refundDue > 0 && (
                  <Row label="Refund Due" value={inr(partB.tds.refundDue)} bold total tone="emerald" />
                )}
                {partB.tds.balanceDue === 0 && partB.tds.refundDue === 0 && (
                  <Row label="Tax Remaining" value={inr(0)} bold total />
                )}
              </Section>

              {/* Monthly TDS trail */}
              {partB.tds.monthly.length > 0 && (
                <Section title="F. Monthly Salary & TDS Schedule">
                  <table className="w-full text-xs">
                    <thead className="text-table-head font-bold text-gray-500 uppercase tracking-wider">
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3">Month</th>
                        <th className="text-right py-2 px-3">Gross Paid</th>
                        <th className="text-right py-2 px-3">TDS Deducted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partB.tds.monthly.map((m, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-3 text-gray-700">{m.month}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{inr(m.grossPaid)}</td>
                          <td className="py-2 px-3 text-right text-gray-900 font-medium">{inr(m.tdsDeducted)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="py-2 px-3 text-gray-900">Total</td>
                        <td className="py-2 px-3 text-right text-gray-900">{inr(grossSalary)}</td>
                        <td className="py-2 px-3 text-right text-gray-900">{inr(partB.tds.totalDeducted)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-500">
            Part A (TRACES TDS Certificate) must be obtained separately from the TRACES portal.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50 rounded-md text-gray-700"
            >
              Close
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading || !partB}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md font-medium"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloading ? "Downloading…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small layout primitives kept inside this file to keep the modal self-contained
// ---------------------------------------------------------------------------

function Section({
  title, tone = "blue", children,
}: {
  title: string;
  tone?: "blue" | "amber" | "rose" | "emerald";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "amber" ? "border-amber-200 bg-amber-50/40" :
    tone === "rose" ? "border-rose-200 bg-rose-50/40" :
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/40" :
    "border-green-200 bg-green-50/40";
  const headerCls =
    tone === "amber" ? "text-amber-900 bg-amber-100/60" :
    tone === "rose" ? "text-rose-900 bg-rose-100/60" :
    tone === "emerald" ? "text-emerald-900 bg-emerald-100/60" :
    "text-green-900 bg-green-100/60";
  return (
    <div className={`rounded-md border ${toneCls} overflow-hidden`}>
      <div className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${headerCls}`}>
        {title}
      </div>
      <div className="divide-y divide-gray-100 bg-white">{children}</div>
    </div>
  );
}

function Row({
  label, value, bold = false, muted = false, subtotal = false, total = false, placeholder = false, tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  subtotal?: boolean;
  total?: boolean;
  placeholder?: boolean;
  tone?: "rose" | "emerald";
}) {
  const valueTone =
    tone === "rose" ? "text-rose-700" :
    tone === "emerald" ? "text-emerald-700" :
    muted ? "text-gray-500" :
    "text-gray-900";
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${
        total ? "bg-gray-50" : subtotal ? "bg-gray-50/40" : ""
      }`}
    >
      <span className={`${bold ? "font-bold text-gray-900" : "text-gray-700"} ${placeholder ? "italic text-gray-400" : ""}`}>
        {label}
      </span>
      <span className={`tabular-nums ${bold ? "font-bold" : ""} ${valueTone} ${placeholder ? "italic text-gray-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}
