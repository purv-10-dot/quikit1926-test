"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { FileMinus, ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Note { id: string; noteNumber: string; noteDate: string; amount: string; reason: string; status: string; customer: { name: string } | null; invoice: { invoiceNumber: string } | null }
interface Customer { id: string; name: string }
interface Invoice { id: string; invoiceNumber: string; status: string; total: string; paidAmount: string }

const BADGE: Record<string, string> = { issued: "bg-amber-100 text-amber-700", applied: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700" };

export default function CreditNotesPage() {
  const [items, setItems] = useState<Note[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ noteNumber: "", customerId: "", invoiceId: "", noteDate: new Date().toISOString().slice(0, 10), amount: "", reason: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/credit-notes"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/customers").then(r => r.json()).then(j => j.success && setCustomers(j.data)); }, [refresh]);

  useEffect(() => {
    if (!form.customerId) { setInvoices([]); return; }
    fetch(`/api/finance/invoices?customerId=${form.customerId}`).then(r => r.json()).then(j => {
      if (j.success) setInvoices((j.data as Invoice[]).filter((i: Invoice) => i.status !== "paid" && i.status !== "cancelled"));
    });
  }, [form.customerId]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, invoiceId: form.invoiceId || null, amount: Number(form.amount) };
      const r = await fetch("/api/finance/credit-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove(n: Note) {
    if (!window.confirm(`Delete ${n.noteNumber}?`)) return;
    const r = await fetch(`/api/finance/credit-notes/${n.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.success) toast.error(j.error ?? "Delete failed");
    else { toast.success(`Credit note ${n.noteNumber} deleted`); refresh(); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Credit Notes</h1><p className="text-xs text-gray-500">Issue a credit to reduce a customer's outstanding. Can be auto-applied to an invoice.</p></div>
        <AddButton onClick={() => { setForm({ noteNumber: `CN-${Date.now().toString().slice(-6)}`, customerId: "", invoiceId: "", noteDate: new Date().toISOString().slice(0, 10), amount: "", reason: "", remarks: "" }); setErr(null); setOpen(true); }}>Issue Credit Note</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={8} /> : items.length === 0 ? (
        <EmptyState icon={FileMinus} title="No credit notes" message="Issue credits against invoices or standalone." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Note #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Invoice</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Reason</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 40 }}></th>
            </tr></thead>
            <tbody>{items.map(n => (
              <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{n.noteNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(n.noteDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">{n.customer?.name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-accent-700">{n.invoice?.invoiceNumber ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{n.amount}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{n.reason}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[n.status] ?? "bg-gray-100"}`}>{n.status}</span></td>
                <td className="px-3 py-2">{n.status !== "applied" && <button onClick={() => remove(n)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Issue Credit Note"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Issue"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Details">
            <FormRow cols={2}>
              <Field label="Note #" required><Input value={form.noteNumber} onChange={e => setForm({ ...form, noteNumber: e.target.value.toUpperCase() })} /></Field>
              <Field label="Date" required><Input type="date" value={form.noteDate} onChange={e => setForm({ ...form, noteDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Customer" required><Select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value, invoiceId: "" })} options={customers.map(c => ({ value: c.id, label: c.name }))} placeholder="— select —" /></Field>
              <Field label="Apply to Invoice"><Select value={form.invoiceId} onChange={e => setForm({ ...form, invoiceId: e.target.value })} options={invoices.map(i => ({ value: i.id, label: `${i.invoiceNumber} (₹${Number(i.total) - Number(i.paidAmount)} outstanding)` }))} placeholder="— standalone —" /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Amount ₹" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Reason" required><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></Field>
            </FormRow>
            <Field label="Remarks"><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></Field>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
