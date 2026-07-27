"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Modal } from "@/components/hrms/modal";
import Link from "next/link";
import { Plus, Check, X, Trash2, Gift, Upload, Download, FileSpreadsheet, AlertTriangle, Settings } from "lucide-react";
import { clsx } from "clsx";
import { read, utils, writeFile } from "xlsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

type Kind = "Bonus" | "Arrears" | "Incentive" | "Commission" | "PerformanceBonus" | "ReferralBonus" | "Other" | "Deduction";
type Status = "Pending" | "Approved" | "Rejected" | "Applied";
type Category =
  | "Bonus" | "Incentive" | "Commission" | "OtherEarning"
  | "OtherDeduction" | "LoanDeduction" | "NoticePayDeduction";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

interface Row {
  id: string;
  employeeId: string;
  employee: Employee | null;
  kind: Kind;
  category: Category;
  componentCode: string;
  componentName: string;
  amount: string;
  payPeriod: string;
  status: Status;
  reason: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const STATUS_BADGE: Record<Status, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Applied: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
};

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "Bonus", label: "Bonus" },
  { value: "Arrears", label: "Arrears" },
  { value: "Incentive", label: "Incentive" },
  { value: "Commission", label: "Commission" },
  { value: "PerformanceBonus", label: "Performance Bonus" },
  { value: "ReferralBonus", label: "Referral Bonus" },
  { value: "Other", label: "Other Earning" },
  { value: "Deduction", label: "Deduction" },
];

const EARNING_CATEGORIES: { value: Category; label: string }[] = [
  { value: "Bonus", label: "Bonus" },
  { value: "Incentive", label: "Incentive" },
  { value: "Commission", label: "Commission" },
  { value: "OtherEarning", label: "Other Earning" },
];

const DEDUCTION_CATEGORIES: { value: Category; label: string }[] = [
  { value: "OtherDeduction", label: "Other Deduction" },
  { value: "LoanDeduction", label: "Loan / Advance Recovery" },
  { value: "NoticePayDeduction", label: "Notice Pay Deduction" },
];

// Canonical tax / statutory flags per Kind — must MATCH lib/services/one-time-defaults.ts.
// Kept here too so the UI can show the read-only preview without an extra fetch.
const KIND_FLAGS: Record<Kind, { taxable: boolean; considerForEPF: boolean; considerForESI: boolean; considerForPT: boolean }> = {
  Bonus:            { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  Arrears:          { taxable: true,  considerForEPF: true,  considerForESI: true,  considerForPT: true  },
  Incentive:        { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  Commission:       { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  PerformanceBonus: { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  ReferralBonus:    { taxable: true,  considerForEPF: false, considerForESI: false, considerForPT: false },
  Other:            { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  Deduction:        { taxable: false, considerForEPF: false, considerForESI: false, considerForPT: false },
};

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ring-1",
      on ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-50 text-gray-400 ring-gray-200 line-through",
    )}>
      {on ? "✓" : "—"} {label}
    </span>
  );
}

const isDeductionKind = (k: Kind) => k === "Deduction";

function nextPayPeriod(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function OneTimeEarningsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState<"" | Status>("");

  const { data: empRes } = useQuery({
    queryKey: ["payroll", "one-time", "employees"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=500"),
  });
  const employees = empRes?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "one-time", filter],
    queryFn: () => api.get<Row[]>(`/api/v1/hrms/payroll/one-time-earnings${filter ? `?status=${filter}` : ""}`),
  });
  const rows = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/one-time-earnings", body),
    onSuccess: () => {
      toast.success("Created", "One-time earning recorded; awaiting approval.");
      qc.invalidateQueries({ queryKey: ["payroll", "one-time"] });
      setShowForm(false);
    },
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/hrms/payroll/one-time-earnings/${id}`, body),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["payroll", "one-time"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/payroll/one-time-earnings/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["payroll", "one-time"] });
    },
  });

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">One-Time Pay</h1>
            <p className="text-xs text-gray-500">
              Bonus, arrears, incentives, advance recovery & other ad-hoc adjustments. Approved entries auto-apply to the next pay run for the chosen period.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filter}
            onChange={(v) => setFilter(v as Status | "")}
            options={[
              { value: "", label: "All status" },
              { value: "Pending", label: "Pending" },
              { value: "Approved", label: "Approved" },
              { value: "Applied", label: "Applied" },
              { value: "Rejected", label: "Rejected" },
            ]}
            className="w-36"
          />
          <Link
            href="/payroll/one-time-earnings/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md text-xs font-medium"
            title="Configure tax & statutory defaults per Kind"
          >
            <Settings size={13} /> Defaults
          </Link>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md text-xs font-medium"
          >
            <Upload size={13} /> Import Excel
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
          >
            {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "New"}
          </button>
        </div>
      </div>

      <ImportExcelModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(inserted) => {
          if (inserted > 0) {
            qc.invalidateQueries({ queryKey: ["payroll", "one-time"] });
            toast.success("Imported", `${inserted} row${inserted === 1 ? "" : "s"} created in Pending.`);
          }
        }}
      />

      {showForm && (
        <CreateForm
          employees={employees}
          submitting={createMut.isPending}
          onSubmit={(v) => createMut.mutate(v)}
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">No records yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Kind</th>
                <th className="text-left py-2 px-3">Component</th>
                <th className="text-left py-2 px-3">Pay Period</th>
                <th className="text-right py-2 px-3">Amount</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50/50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-2 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "—"}</p>
                    <p className="text-xs text-gray-500">{r.employee?.employeeCode}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-700">{r.kind}</td>
                  <td className="py-2 px-3">
                    <p className="text-gray-900 font-medium">{r.componentName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{r.componentCode}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-700">
                    {new Date(r.payPeriod).toLocaleString("en-IN", { month: "short", year: "numeric" })}
                  </td>
                  <td className="py-2 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(r.amount))}</td>
                  <td className="py-2 px-3">
                    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-medium", STATUS_BADGE[r.status])}>
                      {r.status}
                    </span>
                    {r.rejectionReason && <p className="text-[11px] text-red-600 mt-0.5">{r.rejectionReason}</p>}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {r.status === "Pending" && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => reviewMut.mutate({ id: r.id, body: { status: "Approved" } })}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Approve"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("Rejection reason");
                            if (!reason) return;
                            reviewMut.mutate({ id: r.id, body: { status: "Rejected", rejectionReason: reason } });
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Reject"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {(r.status === "Pending" || r.status === "Approved" || r.status === "Rejected") && (
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this entry?")) deleteMut.mutate(r.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
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

interface KindFlagsRow { kind: Kind; taxable: boolean; considerForEPF: boolean; considerForESI: boolean; considerForPT: boolean; isCustom: boolean }

function CreateForm({
  employees,
  submitting,
  onSubmit,
}: {
  employees: Employee[];
  submitting: boolean;
  onSubmit: (v: Record<string, unknown>) => void;
}) {
  const api = useApiClient();
  // Live per-tenant defaults from the Settings page. Falls back to the
  // hardcoded KIND_FLAGS only while fetching.
  const { data: liveDefaults } = useQuery({
    queryKey: ["one-time-defaults"],
    queryFn: () => api.get<KindFlagsRow[]>("/api/v1/hrms/payroll/one-time-earnings/defaults"),
  });
  const liveByKind: Record<Kind, { taxable: boolean; considerForEPF: boolean; considerForESI: boolean; considerForPT: boolean }> | null = liveDefaults?.data
    ? Object.fromEntries(liveDefaults.data.map((r) => [r.kind, { taxable: r.taxable, considerForEPF: r.considerForEPF, considerForESI: r.considerForESI, considerForPT: r.considerForPT }])) as Record<Kind, { taxable: boolean; considerForEPF: boolean; considerForESI: boolean; considerForPT: boolean }>
    : null;
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("Bonus");
  const [category, setCategory] = useState<Category>("Bonus");
  const [componentCode, setComponentCode] = useState("BONUS");
  const [componentName, setComponentName] = useState("Bonus");
  const [amount, setAmount] = useState<number | null>(null);
  const [payPeriod, setPayPeriod] = useState(nextPayPeriod());
  const [reason, setReason] = useState("");

  // Statutory flags are now driven by Kind — server-authoritative. The UI
  // shows them as read-only so HR knows what'll be applied. Prefer live
  // tenant overrides; fall back to hardcoded defaults until fetched.
  const kindFlags = liveByKind?.[kind] ?? KIND_FLAGS[kind];

  const inputCls =
    "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const amt = amount ?? 0;
        if (!employeeId || !amt || !payPeriod) return;
        // Statutory flags are intentionally NOT sent — server applies the
        // canonical kind-based defaults so they stay consistent.
        onSubmit({
          employeeId, kind, category, componentCode, componentName,
          amount: amt, payPeriod,
          reason: reason || null,
        });
      }}
      className="rounded-md border border-gray-200 bg-white p-4 space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Employee *</label>
          <Select
            value={employeeId}
            onChange={setEmployeeId}
            options={employees.map((e) => ({
              value: e.id,
              label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
            }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Kind *</label>
          <Select
            value={kind}
            onChange={(v) => {
              const next = v as Kind;
              setKind(next);
              // Re-default downstream fields so an earning-→-deduction switch
              // doesn't leave a stale "Bonus" category / "BONUS" code behind.
              if (isDeductionKind(next)) {
                setCategory("OtherDeduction");
                setComponentCode("DEDUCTION");
                setComponentName("Deduction");
              } else if (isDeductionKind(kind)) {
                setCategory("OtherEarning");
                setComponentCode(next === "Bonus" ? "BONUS" : next.toUpperCase());
                setComponentName(KIND_OPTIONS.find((k) => k.value === next)?.label ?? "Earning");
              }
            }}
            options={KIND_OPTIONS}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
          <Select
            value={category}
            onChange={(v) => setCategory(v as Category)}
            options={isDeductionKind(kind) ? DEDUCTION_CATEGORIES : EARNING_CATEGORIES}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Component Code *</label>
          <input
            value={componentCode}
            onChange={(e) => setComponentCode(e.target.value.toUpperCase())}
            className={inputCls + " font-mono"}
            placeholder="BONUS"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Component Name *</label>
          <input
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Amount *</label>
          <NumberInput
            min={1}
            step={0.01}
            value={amount}
            onChange={(v) => setAmount(v)}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Pay Period (Month) *</label>
          <input
            type="month"
            value={payPeriod.slice(0, 7)}
            onChange={(e) => setPayPeriod(`${e.target.value}-01`)}
            className={inputCls}
            required
          />
        </div>
      </div>

      {/* Statutory flags — read-only. Set ONCE per Kind, server-authoritative.
          See lib/services/one-time-defaults.ts for the canonical table. */}
      <div className="rounded-md border border-green-100 bg-green-50/60 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-[10px] font-bold text-green-900 uppercase tracking-wide">
              Tax &amp; statutory treatment for &quot;{KIND_OPTIONS.find((k) => k.value === kind)?.label}&quot;
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <Pill on={kindFlags.taxable} label="Taxable" />
              <Pill on={kindFlags.considerForEPF} label="EPF" />
              <Pill on={kindFlags.considerForESI} label="ESI" />
              <Pill on={kindFlags.considerForPT} label="PT" />
            </div>
            <p className="text-[10px] text-green-700 mt-1.5">
              Applied consistently for every {KIND_OPTIONS.find((k) => k.value === kind)?.label} entry across all employees.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Reason</label>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputCls}
          placeholder="Why this earning is being granted (e.g. Q4 performance, salary hike arrears)"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

// ─── Excel Import ─────────────────────────────────────────

interface ImportRow {
  employeeCode: string;
  kind: Kind;
  category: Category;
  componentCode: string;
  componentName: string;
  amount: number;
  payPeriod: string;
  taxable: boolean;
  considerForEPF: boolean;
  considerForESI: boolean;
  considerForPT: boolean;
  reason: string;
}

interface ImportResult {
  inserted: number;
  failed: number;
  total: number;
  errors: { row: number; employeeCode: string; error: string }[];
}

const TEMPLATE_COLUMNS: { key: keyof ImportRow; label: string; required: boolean; help: string }[] = [
  { key: "employeeCode", label: "Employee Code", required: true, help: "e.g. QK-EMP-0012 (must already exist)" },
  { key: "kind", label: "Kind", required: true, help: "Bonus | Arrears | Incentive | Commission | PerformanceBonus | ReferralBonus | Other | Deduction" },
  { key: "category", label: "Category", required: true, help: "Earnings: Bonus | Incentive | Commission | OtherEarning · Deductions: OtherDeduction | LoanDeduction | NoticePayDeduction" },
  { key: "componentCode", label: "Component Code", required: true, help: "Short code, uppercased on save. e.g. BONUS, ADV_RECOVERY" },
  { key: "componentName", label: "Component Name", required: true, help: "Display name shown on the payslip" },
  { key: "amount", label: "Amount", required: true, help: "Positive number (₹). For deductions also positive — the engine subtracts based on Kind." },
  { key: "payPeriod", label: "Pay Period", required: true, help: "YYYY-MM. e.g. 2026-05" },
  { key: "taxable", label: "Taxable", required: false, help: "Y / N (default Y for earnings, N for deductions)" },
  { key: "considerForEPF", label: "Consider for EPF", required: false, help: "Y / N (default N)" },
  { key: "considerForESI", label: "Consider for ESI", required: false, help: "Y / N (default Y)" },
  { key: "considerForPT", label: "Consider for PT", required: false, help: "Y / N (default Y)" },
  { key: "reason", label: "Reason", required: false, help: "Free text — why this one-time entry was granted" },
];

function asBool(v: unknown, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1", "t"].includes(s)) return true;
  if (["n", "no", "false", "0", "f"].includes(s)) return false;
  return fallback;
}

function downloadTemplate() {
  const headers = TEMPLATE_COLUMNS.map((c) => c.label);
  const sampleEarning = [
    "QK-EMP-0012", "Bonus", "Bonus", "BONUS_Q4", "Q4 Performance Bonus",
    25000, "2026-05", "Y", "N", "Y", "Y", "Q4 high performer",
  ];
  const sampleDeduction = [
    "QK-EMP-0018", "Deduction", "OtherDeduction", "ADV_RECOVERY", "Advance Recovery",
    5000, "2026-05", "N", "N", "N", "N", "Recovery of Apr advance",
  ];
  const ws = utils.aoa_to_sheet([headers, sampleEarning, sampleDeduction]);
  // Reasonable column widths.
  (ws as { "!cols"?: { wch: number }[] })["!cols"] = headers.map((h) =>
    ({ wch: Math.max(h.length + 2, 16) }),
  );
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "OneTimeEntries");
  writeFile(wb, "one-time-entries-template.xlsx");
}

function parseRows(buffer: ArrayBuffer): { rows: ImportRow[]; errors: { row: number; error: string }[] } {
  const wb = read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], errors: [{ row: 0, error: "Workbook is empty" }] };

  const json = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const errors: { row: number; error: string }[] = [];
  const rows: ImportRow[] = [];

  json.forEach((raw, idx) => {
    const rowNo = idx + 2; // header is row 1
    const get = (label: string): string => {
      const v = raw[label];
      return v == null ? "" : String(v).trim();
    };
    const employeeCode = get("Employee Code");
    const kind = get("Kind");
    const category = get("Category");
    const componentCode = get("Component Code");
    const componentName = get("Component Name");
    const amountRaw = get("Amount");
    const payPeriod = get("Pay Period");

    if (!employeeCode || !kind || !componentCode || !componentName || !amountRaw || !payPeriod) {
      errors.push({ row: rowNo, error: "Missing required field(s)" });
      return;
    }
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ row: rowNo, error: `Amount must be a positive number (got "${amountRaw}")` });
      return;
    }
    rows.push({
      employeeCode,
      kind: kind as Kind,
      category: (category || (kind === "Deduction" ? "OtherDeduction" : "OtherEarning")) as Category,
      componentCode,
      componentName,
      amount,
      payPeriod,
      taxable: asBool(raw["Taxable"], kind !== "Deduction"),
      considerForEPF: asBool(raw["Consider for EPF"], false),
      considerForESI: asBool(raw["Consider for ESI"], kind !== "Deduction"),
      considerForPT: asBool(raw["Consider for PT"], kind !== "Deduction"),
      reason: get("Reason"),
    });
  });

  return { rows, errors };
}

function ImportExcelModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (insertedCount: number) => void;
}) {
  const api = useApiClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; error: string }[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFileName(null);
    setParsed([]);
    setParseErrors([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const { rows, errors } = parseRows(buf);
      setParsed(rows);
      setParseErrors(errors);
    } catch (e) {
      toast.error("Could not read file", (e as Error).message);
      reset();
    }
  };

  const importMut = useMutation({
    mutationFn: () => api.post<ImportResult>("/api/v1/hrms/payroll/one-time-earnings/bulk", { rows: parsed }),
    onSuccess: (res) => {
      setResult(res.data);
      onImported(res.data.inserted);
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Import one-time entries from Excel"
      subtitle="Bulk-create bonuses, arrears, incentives or deductions. All rows land in Pending status."
      headerIcon={<FileSpreadsheet size={20} />}
      size="xl"
      bodyClassName="overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {/* Field reference table — always visible */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-gray-900">Required & optional fields</h3>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#166534] bg-[#166534]/10 hover:bg-[#166534] hover:text-white transition"
            >
              <Download size={13} /> Download template
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg ring-1 ring-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Column</th>
                  <th className="text-left px-3 py-2 font-semibold">Required</th>
                  <th className="text-left px-3 py-2 font-semibold">Description / allowed values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {TEMPLATE_COLUMNS.map((c) => (
                  <tr key={c.key} className="text-gray-700">
                    <td className="px-3 py-1.5 font-mono font-semibold text-gray-900">{c.label}</td>
                    <td className="px-3 py-1.5">
                      {c.required ? (
                        <span className="text-red-600 font-bold">Yes</span>
                      ) : (
                        <span className="text-gray-400">Optional</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{c.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Tip: the template includes two example rows — one earning, one deduction. Delete them before adding your data.
          </p>
        </div>

        {/* File picker */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {!fileName ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl ring-2 ring-dashed ring-gray-300 hover:ring-[#166534] hover:bg-gray-50 p-8 text-center transition"
            >
              <Upload size={28} className="text-gray-400 mx-auto mb-2" />
              <p className="text-[13px] font-semibold text-gray-700">Click to upload an Excel file</p>
              <p className="text-[11px] text-gray-500 mt-1">.xlsx / .xls / .csv — up to 1,000 rows per import</p>
            </button>
          ) : (
            <div className="rounded-xl ring-1 ring-gray-200 bg-white p-4 flex items-center gap-3">
              <FileSpreadsheet size={22} className="text-emerald-600" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{fileName}</p>
                <p className="text-[11px] text-gray-500">
                  {parsed.length} valid row{parsed.length === 1 ? "" : "s"}
                  {parseErrors.length > 0 && ` · ${parseErrors.length} skipped`}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2"
              >
                Change file
              </button>
            </div>
          )}
        </div>

        {/* Client-side parse errors */}
        {parseErrors.length > 0 && (
          <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-amber-600" />
              <p className="text-xs font-bold text-amber-900">{parseErrors.length} row{parseErrors.length === 1 ? "" : "s"} skipped during parsing</p>
            </div>
            <ul className="text-[11px] text-amber-900 space-y-0.5 max-h-32 overflow-auto">
              {parseErrors.slice(0, 50).map((e, i) => (
                <li key={i}>Row {e.row}: {e.error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview */}
        {parsed.length > 0 && !result && (
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              Preview · first 5 of {parsed.length} row{parsed.length === 1 ? "" : "s"}
            </h4>
            <div className="overflow-x-auto rounded-lg ring-1 ring-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-1.5">Emp Code</th>
                    <th className="text-left px-3 py-1.5">Kind</th>
                    <th className="text-left px-3 py-1.5">Category</th>
                    <th className="text-left px-3 py-1.5">Component</th>
                    <th className="text-right px-3 py-1.5">Amount</th>
                    <th className="text-left px-3 py-1.5">Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsed.slice(0, 5).map((r, i) => (
                    <tr key={i} className="text-gray-700">
                      <td className="px-3 py-1.5 font-mono">{r.employeeCode}</td>
                      <td className="px-3 py-1.5">{r.kind}</td>
                      <td className="px-3 py-1.5">{r.category}</td>
                      <td className="px-3 py-1.5">{r.componentName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{INR.format(r.amount)}</td>
                      <td className="px-3 py-1.5">{r.payPeriod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Server result */}
        {result && (
          <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Import finished</p>
                <p className="text-xs text-gray-600">
                  <span className="font-semibold text-emerald-700">{result.inserted}</span> inserted ·{" "}
                  <span className={clsx("font-semibold", result.failed > 0 ? "text-red-600" : "text-gray-400")}>{result.failed}</span> failed ·{" "}
                  <span className="text-gray-500">{result.total} total</span>
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-1.5">
                  Failed rows
                </p>
                <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row} <span className="font-mono">({e.employeeCode})</span>: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60">
        <button
          type="button"
          onClick={() => { reset(); onClose(); }}
          className="px-3 py-1.5 border border-gray-300 bg-white rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {result ? "Close" : "Cancel"}
        </button>
        {!result && (
          <button
            type="button"
            disabled={parsed.length === 0 || importMut.isPending}
            onClick={() => importMut.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium"
          >
            {importMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {importMut.isPending
              ? "Importing…"
              : parsed.length > 0
                ? `Import ${parsed.length} row${parsed.length === 1 ? "" : "s"}`
                : "Import"}
          </button>
        )}
      </div>
    </Modal>
  );
}
