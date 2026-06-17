"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Receipt, Plus } from "lucide-react";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { ExpenseTabs } from "./_components/expense-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";
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
  _count: { approvals: number };
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
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-[#dbeafe] text-[#2563eb]",
  ManagerApproved: "bg-cyan-100 text-cyan-700",
  FinanceApproved: "bg-[#dbeafe] text-[#2563eb]",
  Approved: "bg-green-100 text-green-700",
  PartiallyApproved: "bg-yellow-100 text-yellow-700",
  Rejected: "bg-red-100 text-red-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

export default function ExpensesListPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: "", category: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    policyId: string; category: Category; title: string; description: string;
    totalAmount: number | null; expenseDate: string; receiptUrl: string; currency: string;
  }>({
    policyId: "", category: "Travel", title: "", description: "",
    totalAmount: null, expenseDate: "", receiptUrl: "", currency: "INR",
  });

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (filters.status) qs.set("status", filters.status);
  if (filters.category) qs.set("category", filters.category);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", "claims", filters],
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

  const selectedPolicy = (policies?.data ?? []).find((p) => p.id === form.policyId) ?? null;
  const policiesForCategory = (policies?.data ?? []).filter((p) => p.category === form.category);
  const violations: string[] = [];
  const warnings: string[] = [];
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
  const blockSubmit = violations.length > 0;

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<Receipt size={28} className="text-[#3b82f6]" />}
        title="Expense claims"
        subtitle="Submit and track reimbursement claims."
        actions={
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus size={14} /> New claim
          </button>
        }
      />
      <div className="mb-5"><ExpenseTabs /></div>

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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Receipt size={32} className="mx-auto mb-2 text-gray-300" /> No claims
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map((c, i) => (
                <tr key={c.id} className="row-stagger hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2">
                    <Link href={`/expenses/${c.id}`} className="text-[#3b82f6] hover:underline font-medium">{c.title}</Link>
                    {c.policy && <div className="text-xs text-gray-400">{c.policy.name}</div>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{c.employeeId}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{c.category}</span></td>
                  <td className="px-4 py-2 text-xs">{c.expenseDate ? new Date(c.expenseDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{c.currency} {Number(c.totalAmount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2"><span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[c.status])}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>

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
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button
              type="submit"
              disabled={createMut.isPending || blockSubmit}
              title={blockSubmit ? "Resolve policy violations first" : undefined}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Draft
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
