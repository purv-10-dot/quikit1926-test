"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection, Textarea } from "@quikit/ui";
import { Coins, ArrowLeft, Trash2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Exp {
  id: string; expenseNumber: string; expenseDate: string; category: string;
  description: string; paidTo: string | null; amount: string; paymentMode: string;
  reference: string | null; project: { name: string } | null;
}
interface Project { id: string; name: string }

const CAT: Array<{ value: string; label: string }> = [
  { value: "travel", label: "Travel" }, { value: "site_utility", label: "Site Utility" },
  { value: "office", label: "Office" }, { value: "labour_cash", label: "Labour Cash" },
  { value: "fuel", label: "Fuel" }, { value: "misc", label: "Misc" },
];

export default function ExpensesPage() {
  const [items, setItems] = useState<Exp[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ expenseNumber: "", expenseDate: new Date().toISOString().slice(0, 10), projectId: "", category: "misc", description: "", paidTo: "", amount: "", paymentMode: "cash", reference: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/expenses"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data)); }, [refresh]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, projectId: form.projectId || null, amount: Number(form.amount) };
      const r = await fetch("/api/finance/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove(e: Exp) {
    if (!confirm(`Delete ${e.expenseNumber}?`)) return;
    await fetch(`/api/finance/expenses/${e.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Expenses</h1><p className="text-xs text-gray-500">Petty cash, non-GRN costs — tagged to project for P&L.</p></div>
        <AddButton onClick={() => { setForm({ expenseNumber: `EXP-${Date.now().toString().slice(-6)}`, expenseDate: new Date().toISOString().slice(0, 10), projectId: "", category: "misc", description: "", paidTo: "", amount: "", paymentMode: "cash", reference: "", remarks: "" }); setErr(null); setOpen(true); }}>Add Expense</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Coins} title="No expenses yet" message="Log petty cash or any non-GRN cost." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Expense #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Description</th><th className="text-left px-3 py-2">Paid To</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Mode</th>
              <th style={{ width: 40 }}></th>
            </tr></thead>
            <tbody>{items.map(e => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{e.expenseNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(e.expenseDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{e.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{e.category}</td>
                <td className="px-3 py-2">{e.description}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{e.paidTo ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{e.amount}</td>
                <td className="px-3 py-2 text-xs">{e.paymentMode}</td>
                <td className="px-3 py-2"><button onClick={() => remove(e)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Add Expense"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Details">
            <FormRow cols={2}>
              <Field label="Expense #" required><Input value={form.expenseNumber} onChange={e => setForm({ ...form, expenseNumber: e.target.value.toUpperCase() })} /></Field>
              <Field label="Date" required><Input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Project"><Select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— none —" /></Field>
              <Field label="Category" required><Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CAT} /></Field>
            </FormRow>
            <Field label="Description" required><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <FormRow cols={3}>
              <Field label="Paid To"><Input value={form.paidTo} onChange={e => setForm({ ...form, paidTo: e.target.value })} /></Field>
              <Field label="Amount ₹" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Mode"><Select value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })} options={[{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" }]} /></Field>
            </FormRow>
            <Field label="Reference"><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></Field>
            <Field label="Remarks"><Textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} rows={2} /></Field>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
