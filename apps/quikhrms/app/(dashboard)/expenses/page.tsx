"use client";

import { Suspense, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Receipt, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { ExpenseClaimDrawer } from "./_components/expense-claim-drawer";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { clsx } from "clsx";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { SkeletonTable } from "@/components/hrms/skeleton";

type Category = "Travel" | "Medical" | "Food" | "Internet" | "Phone" | "Office" | "Training" | "Relocation" | "Other";
type Status = "Draft" | "Submitted" | "ManagerApproved" | "FinanceApproved" | "Approved" | "PartiallyApproved" | "Rejected" | "Paid" | "Cancelled";

interface Claim {
  id: string; employeeId: string; category: Category; title: string; description: string | null;
  totalAmount: string | number; currency: string; expenseDate: string | null; status: Status;
  receiptUrl: string | null; submittedAt: string | null; createdAt: string;
  policy: { id: string; name: string } | null;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string | null } | null;
  _count: { approvals: number };
}

function employeeName(
  e: { firstName?: string | null; lastName?: string | null; employeeCode?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!e) return fallback;
  const full = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
  return full || e.employeeCode || fallback;
}

interface Policy {
  id: string; name: string; category: string; isActive: boolean;
  maxPerTransaction: string | number | null;
  maxPerMonth: string | number | null;
  maxPerYear: string | number | null;
  requiresReceipt: boolean;
  receiptThreshold: string | number;
  requiresPreApproval: boolean;
}

const CATEGORIES: Category[] = ["Travel", "Medical", "Food", "Internet", "Phone", "Office", "Training", "Relocation", "Other"];
const STATUSES: Status[] = ["Draft", "Submitted", "ManagerApproved", "FinanceApproved", "Approved", "PartiallyApproved", "Rejected", "Paid", "Cancelled"];

const statusColors: Record<Status, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
  Submitted: "bg-green-50 text-green-700 ring-green-200",
  ManagerApproved: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  FinanceApproved: "bg-green-50 text-green-700 ring-green-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PartiallyApproved: "bg-amber-50 text-amber-700 ring-amber-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default function ExpensesListPage() {
  return (
    <Suspense fallback={<div className="w-full px-5 py-4"><SkeletonTable rows={6} cols={5} /></div>}>
      <ExpensesListInner />
    </Suspense>
  );
}

function ExpensesListInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: "", category: "" });
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<{ id: string; approve: boolean } | null>(null);
  const PAGE_SIZE = 10;
  // Any filter change resets to the first page.
  useEffect(() => { setPage(1); }, [filters]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    policyId: string; category: Category; title: string; description: string;
    totalAmount: number | null; expenseDate: string; receiptUrl: string; currency: string;
  }>({
    policyId: "", category: "Travel", title: "", description: "",
    totalAmount: null, expenseDate: "", receiptUrl: "", currency: "INR",
  });

  const qs = new URLSearchParams();
  qs.set("limit", String(PAGE_SIZE));
  qs.set("page", String(page));
  if (filters.status) qs.set("status", filters.status);
  if (filters.category) qs.set("category", filters.category);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", "claims", filters, page, PAGE_SIZE],
    queryFn: () => api.get<Claim[]>(`/api/v1/hrms/expenses/claims?${qs.toString()}`),
  });

  const { data: policies } = useQuery({
    queryKey: ["expenses", "policies"],
    queryFn: () => api.get<Policy[]>("/api/v1/hrms/expenses/policies?isActive=true&limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/expenses/claims", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setShowCreate(false); },
  });

  const claims = data?.data ?? [];
  const total = data?.meta?.total ?? claims.length;
  const totalPages = data?.meta?.totalPages ?? 1;

  const selectedPolicy = (policies?.data ?? []).find((p) => p.id === form.policyId) ?? null;
  const policiesForCategory = (policies?.data ?? []).filter((p) => p.category === form.category);
  const violations: string[] = [];
  const warnings: string[] = [];
  // Logical checks independent of policy.
  if (form.totalAmount == null || Number(form.totalAmount) <= 0) {
    violations.push("Amount must be greater than 0.");
  }
  if (form.expenseDate && form.expenseDate > new Date().toISOString().slice(0, 10)) {
    violations.push("Expense date can't be in the future.");
  }
  if (!form.policyId) {
    if (policiesForCategory.length === 0) {
      violations.push(`No active policy exists for category "${form.category}". Ask Finance to create one.`);
    } else {
      violations.push("Policy is required. Pick one from the dropdown.");
    }
  }
  if (selectedPolicy) {
    const amt = Number(form.totalAmount ?? 0);
    if (selectedPolicy.category !== form.category) {
      violations.push(`Category "${form.category}" does not match policy category "${selectedPolicy.category}".`);
    }
    if (selectedPolicy.maxPerTransaction != null) {
      const max = Number(selectedPolicy.maxPerTransaction);
      if (amt > max) {
        violations.push(`Amount ${amt.toLocaleString("en-IN")} exceeds policy limit of ${max.toLocaleString("en-IN")} per transaction.`);
      } else if (amt > 0 && amt > max * 0.9) {
        warnings.push(`Approaching limit (${Math.round((amt / max) * 100)}% of ${max.toLocaleString("en-IN")}).`);
      }
    }
    if (selectedPolicy.requiresReceipt) {
      const threshold = Number(selectedPolicy.receiptThreshold ?? 0);
      if (amt > threshold && !form.receiptUrl) {
        violations.push(`Receipt required for amounts above ${threshold.toLocaleString("en-IN")}.`);
      }
    }
    if (selectedPolicy.requiresPreApproval) {
      warnings.push("This policy requires pre-approval before submission.");
    }
  }
  // "Other" is a catch-all — force the user to describe what it actually is.
  if (form.category === "Other" && !form.description.trim()) {
    violations.push('Description is required when category is "Other" — please specify the expense.');
  }
  const blockSubmit = violations.length > 0;

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Receipt size={28} className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Expense claims</h1>
            <p className="text-xs text-gray-500 mt-1">Submit and track reimbursement claims.</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={13} /> New claim
        </button>
      </div>

      <>
      <div className="mb-4">
        <FilterBar>
          <Select
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            placeholder="All statuses"
            options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            value={filters.category}
            onChange={(v) => setFilters({ ...filters, category: v })}
            placeholder="All categories"
            options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <FilterDivider />
          <FilterSearch value="" onChange={() => {}} placeholder="Search claims..." />
        </FilterBar>
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={5} /> : claims.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          <Receipt size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-[13px] font-semibold">No claims found</p>
          <p className="text-xs text-slate-400 mt-0.5">Submit your first reimbursement claim</p>
        </div>
      ) : (
        <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Title</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Employee</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Category</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Date</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Amount</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c, i) => (
                <tr key={c.id} className="row-stagger border-b border-slate-100 transition hover:bg-slate-50/60" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setDrawer({ id: c.id, approve: true })} className="text-left text-[#22c55e] hover:underline font-semibold text-[13px]">{c.title}</button>
                    {c.policy && <div className="text-[11px] text-slate-400">{c.policy.name}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{employeeName(c.employee, c.employeeId)}</td>
                  <td className="px-4 py-2.5"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-200">{c.category}</span></td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">{c.expenseDate ? new Date(c.expenseDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-slate-900">{c.currency} {Number(c.totalAmount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5"><span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ring-1", statusColors[c.status])}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="tabular-nums">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
        </>
      )}
      </>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Expense Claim">
        <form onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate({
            ...form,
            policyId: form.policyId,
            description: form.description || undefined,
            expenseDate: form.expenseDate || undefined,
            receiptUrl: form.receiptUrl || undefined,
          });
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v as Category, policyId: "" })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Policy <span className="text-red-500">*</span></label>
              <Select
                value={form.policyId}
                onChange={(v) => setForm({ ...form, policyId: v })}
                placeholder={policiesForCategory.length > 0 ? "Select a policy" : "No active policy for this category"}
                options={policiesForCategory.map((p) => ({ value: p.id, label: p.name }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <NumberInput step="0.01" required value={form.totalAmount} onChange={(v) => setForm({ ...form, totalAmount: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <Select
                value={form.currency}
                onChange={(v) => setForm({ ...form, currency: v })}
                options={["INR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Expense Date</label>
              <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
              <FileUploadInput
                value={form.receiptUrl}
                onChange={(url) => setForm({ ...form, receiptUrl: url })}
                accept="application/pdf,image/png,image/jpeg,image/webp"
                label=""
                placeholder="Upload receipt (PDF / image)"
              />
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">
              Description {form.category === "Other" && <span className="text-red-500">*</span>}
            </label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={form.category === "Other" ? "Please specify what this expense is for…" : undefined}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} />
            {form.category === "Other" && (
              <p className="mt-1 text-[11px] text-gray-500">Required for the &quot;Other&quot; category — briefly describe the expense.</p>
            )}
          </div>

          {violations.length > 0 && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3">
              <p className="text-xs font-bold text-rose-700 mb-1">Policy violations</p>
              <ul className="text-xs text-rose-700 list-disc list-inside space-y-0.5">
                {violations.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3">
              <p className="text-xs font-bold text-amber-700 mb-1">Warnings</p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={createMut.isPending || blockSubmit}
              title={blockSubmit ? "Resolve policy violations first" : undefined}
              className="btn btn-primary"
            >
              Create Draft
            </button>
          </div>
        </form>
      </Modal>

      <ExpenseClaimDrawer claimId={drawer?.id ?? null} allowApprove={drawer?.approve ?? false} onClose={() => setDrawer(null)} />
    </div>
  );
}
