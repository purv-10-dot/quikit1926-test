"use client";

import { useEffect, useState } from "react";
import { SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { Trash2 } from "lucide-react";

interface Props { open: boolean; onClose: () => void; onSaved: () => void; }
interface Vendor { id: string; name: string }
interface OpenBill { id: string; billNumber: string; total: string; paidAmount: string; billDate: string; status: string; }

export function PaymentFormPanel({ open, onClose, onSaved }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [header, setHeader] = useState({
    paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
    vendorId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: 0,
    mode: "bank" as "cash" | "cheque" | "bank" | "upi" | "other",
    reference: "",
    remarks: "",
  });
  const [allocs, setAllocs] = useState<Array<{ billId: string; amount: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader(h => ({ ...h, paymentNumber: `PAY-${Date.now().toString().slice(-6)}`, paymentDate: new Date().toISOString().slice(0, 10) }));
    setAllocs([]); setErr(null);
    fetch("/api/masters/vendors").then(r => r.json()).then(j => j.success && setVendors(j.data));
  }, [open]);

  useEffect(() => {
    if (!header.vendorId) { setOpenBills([]); return; }
    fetch(`/api/finance/bills?vendorId=${header.vendorId}`).then(r => r.json()).then(j => {
      if (!j.success) return;
      const open = (j.data as OpenBill[]).filter(b => b.status !== "paid" && b.status !== "cancelled" && b.status !== "draft");
      setOpenBills(open);
    });
  }, [header.vendorId]);

  const allocTotal = allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  async function save() {
    setErr(null);
    if (!header.vendorId) { setErr("Pick a vendor"); return; }
    if (header.amount <= 0) { setErr("Amount must be > 0"); return; }
    if (allocTotal > header.amount + 0.01) { setErr("Allocations exceed payment amount"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/finance/payments", {
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
    <SlidePanel size="lg" open={open} onClose={onClose} title="Record Payment"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !header.vendorId || header.amount <= 0}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Header">
          <FormRow cols={2}>
            <Field label="Payment #" required><Input value={header.paymentNumber} onChange={e => setHeader({ ...header, paymentNumber: e.target.value.toUpperCase() })} /></Field>
            <Field label="Date" required><Input type="date" value={header.paymentDate} onChange={e => setHeader({ ...header, paymentDate: e.target.value })} /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Vendor" required>
              <Select value={header.vendorId} onChange={e => setHeader({ ...header, vendorId: e.target.value })}
                options={vendors.map(v => ({ value: v.id, label: v.name }))} placeholder="— select —" />
            </Field>
            <Field label="Amount" required><Input type="number" step="0.01" value={header.amount} onChange={e => setHeader({ ...header, amount: Number(e.target.value) })} /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Mode">
              <Select value={header.mode} onChange={e => setHeader({ ...header, mode: e.target.value as typeof header.mode })}
                options={[{ value: "cash", label: "Cash" }, { value: "cheque", label: "Cheque" }, { value: "bank", label: "Bank" }, { value: "upi", label: "UPI" }, { value: "other", label: "Other" }]} />
            </Field>
            <Field label="Reference"><Input value={header.reference} onChange={e => setHeader({ ...header, reference: e.target.value })} /></Field>
          </FormRow>
          <Field label="Remarks"><Input value={header.remarks} onChange={e => setHeader({ ...header, remarks: e.target.value })} /></Field>
        </FormSection>

        {header.vendorId && (
          <FormSection title={`Allocate (${allocTotal.toFixed(2)} / ${header.amount.toFixed(2)})`}>
            {openBills.length === 0 ? (
              <div className="text-xs text-gray-500">No approved open bills for this vendor.</div>
            ) : (
              <div className="space-y-1">
                {openBills.map(bill => {
                  const alloc = allocs.find(a => a.billId === bill.id);
                  const outstanding = Number(bill.total) - Number(bill.paidAmount);
                  return (
                    <div key={bill.id} className="flex items-center gap-2 text-xs border border-gray-200 rounded px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono">{bill.billNumber}</div>
                        <div className="text-gray-500">Outstanding: ₹{outstanding.toFixed(2)}</div>
                      </div>
                      <Input type="number" step="0.01" placeholder="0.00" style={{ width: 120 }}
                        value={alloc?.amount ?? ""} onChange={e => {
                          const amount = Number(e.target.value) || 0;
                          setAllocs(prev => {
                            const others = prev.filter(a => a.billId !== bill.id);
                            return amount > 0 ? [...others, { billId: bill.id, amount }] : others;
                          });
                        }} />
                      {alloc && <button onClick={() => setAllocs(prev => prev.filter(a => a.billId !== bill.id))} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3 w-3" /></button>}
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
