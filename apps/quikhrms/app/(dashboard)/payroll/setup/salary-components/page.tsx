"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Coins, Plus, ChevronDown, MoreHorizontal, Info, Power, Trash2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/hrms/modal";
import { clsx } from "clsx";
import { NewEarningForm } from "./_forms/new-earning";
import { NewDeductionForm } from "./_forms/new-deduction";
import { NewBenefitForm } from "./_forms/new-benefit";
import type { SalaryComponent, CompType } from "./_forms/types";
import { SkeletonTable, SkeletonLine } from "@/components/hrms/skeleton";

// Reimbursement is intentionally NOT a tab here — the new reimbursement
// flow (top-level /hrms/claims-declarations) uses a fixed category list,
// not the SalaryComponent catalog.
const TABS: CompType[] = ["Earning", "Deduction", "Benefit"];
const TAB_LABEL: Record<CompType, string> = {
  Earning: "Earnings", Deduction: "Deductions", Benefit: "Benefits", Reimbursement: "Reimbursements",
};

export default function SalaryComponentsPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      <SalaryComponentsPageInner />
    </Suspense>
  );
}

function SalaryComponentsPageInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/payroll/setup";
  const [tab, setTab] = useState<CompType>("Earning");
  const [addOpen, setAddOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [preset, setPreset] = useState<CompType>("Earning");

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "salary-components", tab],
    queryFn: () => api.get<SalaryComponent[]>(`/api/v1/hrms/payroll/salary-components?type=${tab}`),
  });

  const { data: templatesRes } = useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<unknown[]>("/api/v1/hrms/payroll/salary-templates?limit=1"),
  });
  const hasTemplate = (templatesRes?.data?.length ?? 0) > 0;

  const list = data?.data ?? [];
  const onCreated = () => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["payroll", "salary-components"] }); };

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#166534] to-[#16a34a] text-white px-5 py-4 shadow-sm flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Coins size={22} />
        </div>
        <div className="flex-1">
          <h1 className="font-serif-display text-base font-semibold leading-tight">Salary Components</h1>
          <p className="text-xs text-white/75 mt-1">
            Earnings, deductions, benefits and reimbursements — building blocks of payslips.
          </p>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#166534] hover:bg-gray-100 rounded-lg text-xs font-medium shadow-sm"
          >
            <Plus size={13} /> Add Component <ChevronDown size={12} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-40 z-50">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setPreset(t); setTab(t); setAddOpen(true); setDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-[#dcfce7]"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs as pill nav */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-1.5 text-[13px] font-semibold rounded-md transition",
              tab === t ? "bg-white text-[#166534] shadow-sm" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Card */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="p-4">
          {isLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Coins size={20} className="text-gray-400" />
              </div>
              <p className="text-xs text-gray-500">No {TAB_LABEL[tab].toLowerCase()} yet.</p>
              <button onClick={() => { setPreset(tab); setAddOpen(true); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#22c55e] hover:underline">
                <Plus size={13} /> Add first {tab.toLowerCase()}
              </button>
            </div>
          ) : (
            <ComponentTable tab={tab} rows={list} />
          )}
        </div>
      </section>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
        <p className="text-xs text-gray-600">
          <strong>Next:</strong> {hasTemplate ? "Assign salary to employees." : "Create a salary template before assigning to employees."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(returnTo.startsWith("/") ? returnTo : "/payroll/setup")}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
          {hasTemplate ? (
            <Link
              href="/payroll/employee-salaries"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm"
            >
              Continue to Employees <ArrowRight size={13} />
            </Link>
          ) : (
            <Link
              href="/payroll/setup/salary-templates"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm"
            >
              <Plus size={13} /> Add Template
            </Link>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={titleFor(preset)} size="xl">
        {preset === "Earning" && <NewEarningForm onCancel={() => setAddOpen(false)} onCreated={onCreated} />}
        {preset === "Deduction" && <NewDeductionForm onCancel={() => setAddOpen(false)} onCreated={onCreated} />}
        {preset === "Benefit" && <NewBenefitForm onCancel={() => setAddOpen(false)} onCreated={onCreated} />}
      </Modal>
    </div>
  );
}

function titleFor(t: CompType): string {
  return `New ${t}`;
}

function RowActions({ row }: { row: SalaryComponent }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggleMut = useMutation({
    mutationFn: () => api.put(`/api/v1/hrms/payroll/salary-components/${row.id}`, { ...row, isActive: !row.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", "salary-components"] }); setOpen(false); },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/payroll/salary-components/${row.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", "salary-components"] }); setConfirmDelete(false); setOpen(false); },
  });

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
        <MoreHorizontal size={12} />
      </button>
      {open && !confirmDelete && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-xl py-1 w-44 z-50">
          <button
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <Power size={13} /> {row.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-xl p-3 w-56 z-50">
          <p className="text-xs text-gray-700 mb-2">Delete <strong>{row.nameInPayslip || row.name}</strong>?</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-xs border border-[var(--border)] rounded">Cancel</button>
            <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
              {deleteMut.isPending ? "..." : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentTable({ tab, rows }: { tab: CompType; rows: SalaryComponent[] }) {
  const headers = headerFor(tab);
  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-table-head font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
            {headers.map((h) => <th key={h} className="text-left py-2.5 px-4">{h}</th>)}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[#22c55e] font-medium">{r.nameInPayslip || r.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded">{r.code}</span>
                </div>
              </td>
              {tab === "Earning" ? (
                <>
                  <td className="py-2.5 px-4 text-gray-700">{humanize(r.category)}</td>
                  <td className="py-2.5 px-4 text-gray-700">{formatCalc(r)}</td>
                  <td className="py-2.5 px-4 text-gray-700">
                    {r.considerForEPF ? "Yes" : "No"}
                    {r.considerEPFIfPFWageLT15k && <span className="text-xs text-gray-500 ml-1">(If PF Wage &lt; 15k)</span>}
                  </td>
                  <td className="py-2.5 px-4 text-gray-700">{r.considerForESI ? "Yes" : "No"}</td>
                </>
              ) : tab === "Deduction" ? (
                <>
                  <td className="py-2.5 px-4 text-gray-700">{humanize(r.category)}</td>
                  <td className="py-2.5 px-4 text-gray-700">{r.isRecurring ? "Recurring" : "One Time"}</td>
                </>
              ) : tab === "Benefit" ? (
                <>
                  <td className="py-2.5 px-4 text-gray-700">{humanize(r.category)}</td>
                  <td className="py-2.5 px-4 text-gray-700">{r.isRecurring ? "Recurring" : "One Time"}</td>
                </>
              ) : (
                <>
                  <td className="py-2.5 px-4 text-gray-700">{humanize(r.category)}</td>
                  <td className="py-2.5 px-4 text-gray-700">{r.maxAmount ? Number(r.maxAmount).toLocaleString("en-IN") : "0"}</td>
                </>
              )}
              <td className="py-2.5 px-4">
                <span className={r.isActive ? "text-emerald-600 font-semibold" : "text-gray-400 font-medium"}>
                  {r.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="py-2.5 px-4 text-right">
                <RowActions row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headerFor(tab: CompType): string[] {
  if (tab === "Earning") return ["Name", "Earning Type", "Calculation Type", "Consider for EPF", "Consider for ESI", "Status"];
  if (tab === "Deduction") return ["Name", "Deduction Type", "Deduction Frequency", "Status"];
  if (tab === "Benefit") return ["Name", "Benefit Type", "Benefit Frequency", "Status"];
  return ["Name", "Reimbursement Type", "Maximum Reimbursable Amount", "Status"];
}

function humanize(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^ /, "").trim();
}

function formatCalc(r: SalaryComponent): string {
  const v = r.amountValue != null ? Number(r.amountValue) : null;
  switch (r.amountType) {
    case "Fixed": return v ? `Fixed; Flat Amount` : "Fixed; Flat Amount";
    case "PercentOfBasic": return v ? `Fixed; ${v}% of Basic` : "Fixed; % of Basic";
    case "PercentOfCTC": return v ? `Fixed; ${v}% of CTC` : "Fixed; % of CTC";
    case "PercentOfGross": return v ? `Fixed; ${v}% of Gross` : "Fixed; % of Gross";
    case "Formula": return "Variable; Formula";
    default: return "";
  }
}
