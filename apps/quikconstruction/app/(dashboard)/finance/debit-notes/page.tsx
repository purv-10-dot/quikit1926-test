"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { FilePlus, ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Note { id: string; noteNumber: string; noteDate: string; amount: string; reason: string; status: string; vendor: { name: string } | null; bill: { billNumber: string } | null }
interface Vendor { id: string; name: string }
interface Bill { id: string; billNumber: string; status: string; total: string; paidAmount: string }

const BADGE: Record<string, string> = { issued: "bg-amber-100 text-amber-700", applied: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700" };

export default function DebitNotesPage() {
  const [items, setItems] = useState<Note[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ noteNumber: "", vendorId: "", billId: "", noteDate: new Date().toISOString().slice(0, 10), amount: "", reason: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/debit-notes"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/vendors").then(r => r.json()).then(j => j.success && setVendors(j.data)); }, [refresh]);

  useEffect(() => {
    if (!form.vendorId) { setBills([]); return; }
    fetch(`/api/finance/bills?vendorId=${form.vendorId}`).then(r => r.json()).then(j => {
      if (j.success) setBills((j.data as Bill[]).filter((b: Bill) => ["approved", "partial"].includes(b.status)));
    });
  }, [form.vendorId]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, billId: form.billId || null, amount: Number(form.amount) };
      const r = await fetch("/api/finance/debit-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove(n: Note) {
    if (!confirm(`Delete ${n.noteNumber}?`)) return;
    const r = await fetch(`/api/finance/debit-notes/${n.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.success) toast.error(j.error ?? "Delete failed");
    else { toast.success(`Debit note deleted`); refresh(); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Debit Notes</h1><p className="text-xs text-gray-500">Raise a debit to reduce a vendor bill's outstanding (returns, pricing disputes).</p></div>
        <AddButton onClick={() => { setForm({ noteNumber: `DN-${Date.now().toString().slice(-6)}`, vendorId: "", billId: "", noteDate: new Date().toISOString().slice(0, 10), amount: "", reason: "", remarks: "" }); setErr(null); setOpen(true); }}>Issue Debit Note</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={8} /> : items.length === 0 ? (
        <EmptyState icon={FilePlus} title="No debit notes" message="Issue debits against vendor bills." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Note #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Vendor</th><th className="text-left px-3 py-2">Bill</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Reason</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 40 }}></th>
            </tr></thead>
            <tbody>{items.map(n => (
              <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{n.noteNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(n.noteDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">{n.vendor?.name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-accent-700">{n.bill?.billNumber ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{n.amount}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{n.reason}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[n.status] ?? "bg-gray-100"}`}>{n.status}</span></td>
                <td className="px-3 py-2">{n.status !== "applied" && <button onClick={() => remove(n)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Issue Debit Note"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Issue"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Details">
            <FormRow cols={2}>
              <Field label="Note #" required><Input value={form.noteNumber} onChange={e => setForm({ ...form, noteNumber: e.target.value.toUpperCase() })} /></Field>
              <Field label="Date" required><Input type="date" value={form.noteDate} onChange={e => setForm({ ...form, noteDate: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Vendor" required><Select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value, billId: "" })} options={vendors.map(v => ({ value: v.id, label: v.name }))} placeholder="— select —" /></Field>
              <Field label="Apply to Bill"><Select value={form.billId} onChange={e => setForm({ ...form, billId: e.target.value })} options={bills.map(b => ({ value: b.id, label: `${b.billNumber} (₹${Number(b.total) - Number(b.paidAmount)} outstanding)` }))} placeholder="— standalone —" /></Field>
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
