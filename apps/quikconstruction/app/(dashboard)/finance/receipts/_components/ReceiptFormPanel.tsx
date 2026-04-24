"use client";

import { useEffect, useState } from "react";
import { SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { Trash2 } from "lucide-react";

interface Props { open: boolean; onClose: () => void; onSaved: () => void; }
interface Customer { id: string; name: string }
interface OpenInvoice { id: string; invoiceNumber: string; total: string; paidAmount: string; invoiceDate: string; }

export function ReceiptFormPanel({ open, onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [header, setHeader] = useState({
    receiptNumber: `RCP-${Date.now().toString().slice(-6)}`,
    customerId: "",
    receiptDate: new Date().toISOString().slice(0, 10),
    amount: 0,
    mode: "bank" as "cash" | "cheque" | "bank" | "upi" | "other",
    reference: "",
    remarks: "",
  });
  const [allocs, setAllocs] = useState<Array<{ invoiceId: string; amount: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader(h => ({ ...h, receiptNumber: `RCP-${Date.now().toString().slice(-6)}`, receiptDate: new Date().toISOString().slice(0, 10) }));
    setAllocs([]); setErr(null);
    fetch("/api/masters/customers").then(r => r.json()).then(j => j.success && setCustomers(j.data));
  }, [open]);

  useEffect(() => {
    if (!header.customerId) { setOpenInvoices([]); return; }
    fetch(`/api/finance/invoices?customerId=${header.customerId}`).then(r => r.json()).then(j => {
      if (!j.success) return;
      const open = (j.data as OpenInvoice[] & Array<{ status: string }>).filter((i: any) => i.status !== "paid" && i.status !== "cancelled");
      setOpenInvoices(open);
    });
  }, [header.customerId]);

  const allocTotal = allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  async function save() {
    setErr(null);
    if (!header.customerId) { setErr("Pick a customer"); return; }
    if (header.amount <= 0) { setErr("Amount must be > 0"); return; }
    if (allocTotal > header.amount + 0.01) { setErr("Allocations exceed receipt amount"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/finance/receipts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, allocations: allocs.filter(a => a.amount > 0) }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <SlidePanel size="lg" open={open} onClose={onClose} title="Record Receipt"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !header.customerId || header.amount <= 0}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Header">
          <FormRow cols={2}>
            <Field label="Receipt #" required><Input value={header.receiptNumber} onChange={e => setHeader({ ...header, receiptNumber: e.target.value.toUpperCase() })} /></Field>
            <Field label="Date" required><Input type="date" value={header.receiptDate} onChange={e => setHeader({ ...header, receiptDate: e.target.value })} /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Customer" required>
              <Select value={header.customerId} onChange={e => setHeader({ ...header, customerId: e.target.value })}
                options={customers.map(c => ({ value: c.id, label: c.name }))} placeholder="— select —" />
            </Field>
            <Field label="Amount" required><Input type="number" step="0.01" value={header.amount} onChange={e => setHeader({ ...header, amount: Number(e.target.value) })} /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Mode">
              <Select value={header.mode} onChange={e => setHeader({ ...header, mode: e.target.value as typeof header.mode })}
                options={[{ value: "cash", label: "Cash" }, { value: "cheque", label: "Cheque" }, { value: "bank", label: "Bank" }, { value: "upi", label: "UPI" }, { value: "other", label: "Other" }]} />
            </Field>
            <Field label="Reference (cheque#/UTR)"><Input value={header.reference} onChange={e => setHeader({ ...header, reference: e.target.value })} /></Field>
          </FormRow>
          <Field label="Remarks"><Input value={header.remarks} onChange={e => setHeader({ ...header, remarks: e.target.value })} /></Field>
        </FormSection>

        {header.customerId && (
          <FormSection title={`Allocate (${allocTotal.toFixed(2)} / ${header.amount.toFixed(2)})`}>
            {openInvoices.length === 0 ? (
              <div className="text-xs text-gray-500">No open invoices for this customer.</div>
            ) : (
              <div className="space-y-1">
                {openInvoices.map(inv => {
                  const alloc = allocs.find(a => a.invoiceId === inv.id);
                  const outstanding = Number(inv.total) - Number(inv.paidAmount);
                  return (
                    <div key={inv.id} className="flex items-center gap-2 text-xs border border-gray-200 rounded px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono">{inv.invoiceNumber}</div>
                        <div className="text-gray-500">Outstanding: ₹{outstanding.toFixed(2)}</div>
                      </div>
                      <Input type="number" step="0.01" placeholder="0.00" style={{ width: 120 }}
                        value={alloc?.amount ?? ""} onChange={e => {
                          const amount = Number(e.target.value) || 0;
                          setAllocs(prev => {
                            const others = prev.filter(a => a.invoiceId !== inv.id);
                            return amount > 0 ? [...others, { invoiceId: inv.id, amount }] : others;
                          });
                        }} />
                      {alloc && <button onClick={() => setAllocs(prev => prev.filter(a => a.invoiceId !== inv.id))} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3 w-3" /></button>}
                    </div>
                  );
                })}
              </div>
            )}
          </FormSection>
        )}
      </div>
    </SlidePanel>
  );
}
