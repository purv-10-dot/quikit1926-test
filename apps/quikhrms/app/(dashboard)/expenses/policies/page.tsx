"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useDialog } from "@/components/hrms/dialog";
import { Plus, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { ExpenseTabs } from "../_components/expense-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";
import { EmptyState } from "@/components/hrms/empty-state";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";

interface Policy {
  id: string; name: string; category: string;
  maxPerTransaction: string | number | null; maxPerMonth: string | number | null; maxPerYear: string | number | null;
  requiresReceipt: boolean; receiptThreshold: string | number; requiresPreApproval: boolean;
  approvalLevels: number; isActive: boolean;
}

const CATEGORIES = ["Travel", "Medical", "Food", "Internet", "Phone", "Office", "Training", "Relocation", "Other"];

export default function ExpensePoliciesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const initialForm = {
    name: "", category: "Travel", maxPerTransaction: null as number | null, maxPerMonth: null as number | null, maxPerYear: null as number | null,
    requiresReceipt: true, receiptThreshold: null as number | null, requiresPreApproval: false, approvalLevels: 1, isActive: true,
  };
  const [form, setForm] = useState(initialForm);

  const openCreate = () => { setEditingId(null); setForm(initialForm); setShowModal(true); };
  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setForm({
      name: p.name, category: p.category,
      maxPerTransaction: p.maxPerTransaction != null ? Number(p.maxPerTransaction) : null,
      maxPerMonth: p.maxPerMonth != null ? Number(p.maxPerMonth) : null,
      maxPerYear: p.maxPerYear != null ? Number(p.maxPerYear) : null,
      requiresReceipt: p.requiresReceipt,
      receiptThreshold: p.receiptThreshold != null ? Number(p.receiptThreshold) : null,
      requiresPreApproval: p.requiresPreApproval, approvalLevels: p.approvalLevels, isActive: p.isActive,
    });
    setShowModal(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["expense-policies"],
    queryFn: () => api.get<Policy[]>("/api/v1/hrms/expenses/policies?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/expenses/policies", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-policies"] }); setShowModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/v1/hrms/expenses/policies/${editingId}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-policies"] }); setShowModal(false); setEditingId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/expenses/policies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-policies"] }),
  });

  const policies = data?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<ShieldCheck size={28} className="text-[#3b82f6]" />}
        title="Expense policies"
        subtitle="Per-category caps and rules."
        actions={
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={14} /> New policy
          </button>
        }
      />
      <div className="mb-5"><ExpenseTabs /></div>

      {isLoading ? <SkeletonCards count={4} /> : policies.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {policies.map((p, i) => (
            <div key={p.id} className={clsx("row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4", !p.isActive && "opacity-60")} style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{p.name}</h3>
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">{p.category}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                    aria-label="Edit policy"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Delete policy?",
                        description: `"${p.name}" policy will be permanently removed.`,
                        variant: "danger",
                        confirmLabel: "Delete",
                      });
                      if (ok) deleteMut.mutate(p.id);
                    }}
                    className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50"
                    aria-label="Delete policy"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mt-3">
                {p.maxPerTransaction && <div><b>Per txn:</b> ₹{Number(p.maxPerTransaction).toLocaleString("en-IN")}</div>}
                {p.maxPerMonth && <div><b>Monthly:</b> ₹{Number(p.maxPerMonth).toLocaleString("en-IN")}</div>}
                {p.maxPerYear && <div><b>Yearly:</b> ₹{Number(p.maxPerYear).toLocaleString("en-IN")}</div>}
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {p.requiresReceipt && <span className="text-xs bg-[#dbeafe] text-[#2563eb] px-2 py-0.5 rounded">Receipt ≥ ₹{Number(p.receiptThreshold)}</span>}
                {p.requiresPreApproval && <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded">Pre-approval</span>}
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{p.approvalLevels} approval level{p.approvalLevels > 1 ? "s" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingId(null); }} title={editingId ? "Edit Expense Policy" : "New Expense Policy"}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const body = {
            ...form,
            maxPerTransaction: form.maxPerTransaction || undefined,
            maxPerMonth: form.maxPerMonth || undefined,
            maxPerYear: form.maxPerYear || undefined,
          };
          if (editingId) updateMut.mutate(body); else createMut.mutate(body);
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Max per transaction</label>
              <NumberInput value={form.maxPerTransaction} onChange={(v) => setForm({ ...form, maxPerTransaction: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Max per month</label>
              <NumberInput value={form.maxPerMonth} onChange={(v) => setForm({ ...form, maxPerMonth: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Max per year</label>
              <NumberInput value={form.maxPerYear} onChange={(v) => setForm({ ...form, maxPerYear: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Receipt threshold</label>
              <NumberInput value={form.receiptThreshold} onChange={(v) => setForm({ ...form, receiptThreshold: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Approval levels</label>
              <NumberInput allowDecimal={false} min={1} value={form.approvalLevels} onChange={(v) => setForm({ ...form, approvalLevels: v ?? 1 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requiresReceipt} onChange={(e) => setForm({ ...form, requiresReceipt: e.target.checked })} /> Requires receipt
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requiresPreApproval} onChange={(e) => setForm({ ...form, requiresPreApproval: e.target.checked })} /> Pre-approval
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditingId(null); }} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
