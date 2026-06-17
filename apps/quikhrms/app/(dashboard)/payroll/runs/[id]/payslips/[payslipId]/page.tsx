"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { ChevronLeft, Download, Mail } from "lucide-react";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { withBasePath } from "@/lib/utils/base-path";

interface PayslipLine {
  id: string;
  componentCode: string;
  componentName: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  category: string;
  amount: string | number;
}

interface BankAccount {
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  isPrimary?: boolean;
}

interface PayRunRes {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  company: { companyName: string | null; addressLine1: string | null; city: string | null; state: string | null } | null;
  payslips: {
    id: string;
    employeeId: string;
    employee: {
      id: string; employeeCode: string; firstName: string; lastName: string; workEmail: string;
      panNumber: string | null; dateOfJoining: string | null; bankAccounts: BankAccount[] | null;
      department: { name: string } | null;
      designation: { title: string } | null;
    } | null;
    workingDays: string | number;
    paidDays: string | number;
    lopDays: string | number;
    grossEarnings: string | number;
    totalDeductions: string | number;
    netPay: string | number;
    lines: PayslipLine[];
    status: string;
  }[];
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
function two(n: number): string {
  if (n < 20) return ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)];
}
function three(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} HUNDRED`);
  if (r) parts.push(two(r));
  return parts.join(" AND ");
}
function toWords(num: number): string {
  const n = Math.round(Math.abs(num));
  if (n === 0) return "ZERO RUPEES";
  const cr = Math.floor(n / 10000000);
  const lk = Math.floor((n % 10000000) / 100000);
  const th = Math.floor((n % 100000) / 1000);
  const r = n % 1000;
  const parts: string[] = [];
  if (cr) parts.push(`${two(cr)} CRORE`);
  if (lk) parts.push(`${two(lk)} LAKH`);
  if (th) parts.push(`${two(th)} THOUSAND`);
  if (r) parts.push(three(r));
  return `${parts.join(" ")} RUPEES`;
}

const STAT_DEDUCTION_CATS = ["EPFEmployee", "ESIEmployee", "ProfessionalTax", "LabourWelfareFund", "IncomeTax"];

export default function PayslipDetailPage() {
  const api = useApiClient();
  const toast = useToast();
  const params = useParams();
  const runId = params.id as string;
  const payslipId = params.payslipId as string;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "runs", runId],
    queryFn: () => api.get<PayRunRes>(`/api/v1/hrms/payroll/runs/${runId}`),
  });

  const resendMut = useMutation({
    mutationFn: () =>
      api.post<{ queued: boolean; to: string }>(
        `/api/v1/hrms/payroll/runs/${runId}/payslips/${payslipId}/resend-email`,
        {},
      ),
    onSuccess: (res) => toast.success("Payslip email queued", `Sent to ${res.data.to}`),
    onError: (e: Error) => toast.error("Resend failed", e.message),
  });

  if (isLoading || !data?.data) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="80%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );
  const run = data.data;
  const p = run.payslips.find((x) => x.id === payslipId);
  if (!p) return <div className="p-8 text-center text-sm text-gray-500">Payslip not found.</div>;

  const earnings = p.lines.filter((l) => l.type === "Earning");
  const taxDeductions = p.lines.filter((l) =>
    l.type === "Deduction" || (l.type === "StatutoryContribution" && STAT_DEDUCTION_CATS.includes(l.category)),
  );

  const start = new Date(run.periodStart);
  const end = new Date(run.periodEnd);
  const actualDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const periodLabel = start.toLocaleString("en-US", { month: "short", year: "numeric" }).replace(" ", "-");

  const primaryBank = (p.employee?.bankAccounts ?? []).find((b) => b.isPrimary) ?? (p.employee?.bankAccounts ?? [])[0];

  const companyName = run.company?.companyName ?? "Company";
  const lopNum = Number(p.lopDays);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Link href={`/payroll/runs/${runId}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6]">
          <ChevronLeft size={14} /> Back to Pay Run
        </Link>
        <div className="flex items-center gap-2">
          {p.status === "Released" && (
            <button
              type="button"
              onClick={() => resendMut.mutate()}
              disabled={resendMut.isPending || !p.employee?.workEmail}
              title={p.employee?.workEmail ? `Send to ${p.employee.workEmail}` : "Employee has no work email"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail size={12} />
              {resendMut.isPending ? "Queuing…" : "Resend Email"}
            </button>
          )}
          <a
            href={withBasePath(`/api/v1/hrms/payroll/payslips/${p.id}/pdf`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[#16243A] hover:bg-[#1E3354] text-white rounded"
          >
            <Download size={12} /> Download PDF
          </a>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-8 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold uppercase text-gray-900 tracking-wide">{companyName}</h1>
          <p className="text-sm text-gray-700 mt-1">Pay Slip ({periodLabel})</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card title="Employee Details" rows={[
            ["Employee Name", (p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : "NA").toUpperCase()],
            ["Employee No.", p.employee?.employeeCode ?? "NA"],
            ["Date Of joining", p.employee?.dateOfJoining ? new Date(p.employee.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "NA"],
            ["Department", p.employee?.department?.name ?? "NA"],
            ["Designation", p.employee?.designation?.title ?? "NA"],
          ]} />
          <Card title="Bank Details" rows={[
            ["Bank Acc. No.", primaryBank?.accountNumber ?? "NA"],
            ["Bank Name", primaryBank?.bankName ?? "NA"],
            ["Bank IFSC", primaryBank?.ifsc ?? "NA"],
            ["PAN No.", p.employee?.panNumber ?? "NA"],
          ]} />
        </div>

        <div className="rounded-md border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">Salary Details</h3>
          </div>
          <div className="grid grid-cols-4">
            <DayCell label="Actual Days" value={String(actualDays)} />
            <DayCell label="Working Days" value={String(Number(p.workingDays))} />
            <DayCell label="Loss of Days" value={lopNum > 0 ? String(lopNum) : "NA"} />
            <DayCell label="Days Payble" value={String(Number(p.paidDays))} />
          </div>
        </div>

        <Section title="Earnings" rightLabel="E">
          {earnings.map((l) => (
            <Row key={l.id} label={l.componentName} value={INR.format(Number(l.amount))} />
          ))}
          <Row label="Total Earnings (E)" value={INR.format(Number(p.grossEarnings))} bold border />
        </Section>

        <Section title="Tax Deductions" rightLabel="TD">
          {taxDeductions.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-400">—</div>
          )}
          {taxDeductions.map((l) => (
            <Row key={l.id} label={l.componentName} value={INR.format(Number(l.amount))} />
          ))}
          <Row label="Total Tax Deductions (TD)" value={INR.format(Number(p.totalDeductions))} bold border />
        </Section>

        <div className="pt-3 border-t border-gray-200 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-bold text-gray-900">Net Salary (Payable Salary) (E - TD)</span>
            <span className="text-base font-bold text-gray-900">{INR.format(Number(p.netPay))}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-bold text-gray-900">Net Salary in words</span>
            <span className="text-xs text-gray-700 uppercase">{toWords(Number(p.netPay))}</span>
          </div>
        </div>

        <div className="pt-2 space-y-1 text-xs text-gray-500 italic">
          <p className="font-bold text-gray-700">*Note : All amount displayed in this payslip are in INR</p>
          <p>*This is computer generated statement does not required signature.</p>
        </div>
      </div>
    </div>
  );
}

function Card({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="p-4 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 text-sm">
            <span className="text-gray-600">{k}</span>
            <span className="text-gray-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 border-r last:border-r-0 border-gray-200 text-center">
      <p className="text-xs font-bold text-gray-700">{label}</p>
      <p className="text-base text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function Section({ title, rightLabel, children }: { title: string; rightLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {rightLabel && <span className="text-xs font-bold text-gray-500 uppercase">{rightLabel}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value, bold, border }: { label: string; value: string; bold?: boolean; border?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline px-4 py-2 ${border ? "border-t border-gray-200" : "border-b border-gray-50"} ${bold ? "font-bold text-gray-900" : "text-gray-700"} text-sm`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
