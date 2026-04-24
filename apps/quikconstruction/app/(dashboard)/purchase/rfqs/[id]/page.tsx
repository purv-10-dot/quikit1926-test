"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Button, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Input, NumberInput, Select, Field, FormRow, FormSection, useConfirm,
} from "@quikit/ui";
import { ArrowLeft, Award, ShoppingCart } from "lucide-react";

interface Line { id: string; item: { code: string; name: string }; uom: { code: string }; quantity: string; specification: string | null }
interface VendorRow { id: string; vendor: { id: string; name: string }; quotationRef: string | null; totalAmount: string | null; isAwarded: boolean }
interface Rfq {
  id: string; rfqNumber: string; status: string; rfqDate: string; closingDate: string | null; remarks: string | null;
  project: { id: string; name: string } | null;
  lines: Line[];
  vendors: VendorRow[];
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  quotations_received: "bg-amber-100 text-amber-700", awarded: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/purchase/rfqs/${id}`);
    const j = await r.json();
    if (j.success) setRfq(j.data);
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!rfq) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const awardedVendor = rfq.vendors.find((v) => v.isAwarded);

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/purchase/rfqs" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> RFQs
      </Link>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">{rfq.rfqNumber}</h1>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[rfq.status] ?? "bg-gray-100 text-gray-600"}`}>{rfq.status.replace(/_/g, " ")}</span>
          </div>
          {rfq.remarks && <p className="text-xs text-gray-500 mt-0.5">{rfq.remarks}</p>}
        </div>
        <div className="flex items-center gap-2">
          {rfq.status !== "awarded" && rfq.status !== "cancelled" && (
            <Button onClick={() => setAwardOpen(true)} size="sm">
              <Award className="h-3.5 w-3.5" /> Award Vendor
            </Button>
          )}
          {rfq.status === "awarded" && (
            <Button onClick={() => setConvertOpen(true)} size="sm">
              <ShoppingCart className="h-3.5 w-3.5" /> Convert to PO
            </Button>
          )}
        </div>
      </div>

      {/* Meta */}
      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
          <MetaCell label="Project" value={rfq.project?.name ?? "—"} />
          <MetaCell label="RFQ Date" value={new Date(rfq.rfqDate).toISOString().slice(0, 10)} />
          <MetaCell label="Closing Date" value={rfq.closingDate ? new Date(rfq.closingDate).toISOString().slice(0, 10) : "—"} />
          <MetaCell label="Lines × Vendors" value={`${rfq.lines.length} × ${rfq.vendors.length}`} />
        </div>
      </section>

      {/* Lines */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Line Items</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">Specification</th>
              </tr>
            </thead>
            <tbody>
              {rfq.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-gray-900">{l.item.code}</div>
                    <div className="text-xs text-gray-500">{l.item.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{l.quantity} {l.uom.code}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{l.specification ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Vendors + quotes */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Vendors</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-left px-3 py-2">Quotation Ref</th>
                <th className="text-right px-3 py-2">Quoted Total</th>
                <th className="text-left px-3 py-2">Awarded</th>
              </tr>
            </thead>
            <tbody>
              {rfq.vendors.map((v) => (
                <tr key={v.id} className={`border-t border-gray-100 ${v.isAwarded ? "bg-green-50" : ""}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{v.vendor.name}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{v.quotationRef ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{v.totalAmount ? `₹${v.totalAmount}` : "—"}</td>
                  <td className="px-3 py-2">
                    {v.isAwarded ? (
                      <span className="text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">AWARDED</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {awardOpen && <AwardDialog rfq={rfq} onClose={() => setAwardOpen(false)} onDone={refresh} />}
      {convertOpen && awardedVendor && (
        <ConvertDialog rfq={rfq} awarded={awardedVendor} onClose={() => setConvertOpen(false)} onDone={() => { confirm({ title: "PO created", description: "Redirecting…", confirmLabel: "OK", tone: "default" }); refresh(); }} />
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

// ─── Award dialog ────────────────────────────────────────────────────

function AwardDialog({ rfq, onClose, onDone }: { rfq: Rfq; onClose: () => void; onDone: () => void }) {
  const [vendorId, setVendorId] = useState<string>(rfq.vendors[0]?.vendor.id ?? "");
  const [quotationRef, setQuotationRef] = useState("");
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!vendorId || totalAmount == null) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/purchase/rfqs/${rfq.id}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, quotationRef: quotationRef || null, totalAmount }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Award failed");
      onDone();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Award failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent>
        <ModalHeader><ModalTitle>Award Vendor</ModalTitle></ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            <Field label="Vendor" required>
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}
                options={rfq.vendors.map((v) => ({ value: v.vendor.id, label: v.vendor.name }))} />
            </Field>
            <Field label="Quotation Reference" hint="Optional — vendor's quote document number">
              <Input value={quotationRef} onChange={(e) => setQuotationRef(e.target.value)} />
            </Field>
            <Field label="Total Amount (₹)" required>
              <NumberInput value={totalAmount} min={0} onChange={(v) => setTotalAmount(v)} />
            </Field>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !vendorId || totalAmount == null}>
            {busy ? "Awarding…" : "Award"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Convert-to-PO dialog ────────────────────────────────────────────

function ConvertDialog({ rfq, awarded, onClose, onDone }: { rfq: Rfq; awarded: VendorRow; onClose: () => void; onDone: () => void }) {
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState<number | null>(30);
  const [lineRates, setLineRates] = useState<Record<string, { unitRate: number | null; gstRate: number | null }>>(() =>
    Object.fromEntries(rfq.lines.map((l) => [l.id, { unitRate: null, gstRate: 18 }])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (rfq.lines.some((l) => lineRates[l.id].unitRate == null)) {
      setErr("Enter unit rate for every line");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/purchase/rfqs/${rfq.id}/convert-to-po`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber, poDate,
          deliveryDate: deliveryDate || null,
          paymentTermsDays: paymentTermsDays ?? null,
          lineRates: rfq.lines.map((l) => ({
            rfqLineId: l.id,
            unitRate: lineRates[l.id].unitRate ?? 0,
            gstRate: lineRates[l.id].gstRate,
          })),
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Conversion failed");
      onDone();
      onClose();
      window.location.href = `/purchase/orders/${j.data.id}`;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent className="max-w-2xl">
        <ModalHeader><ModalTitle>Convert RFQ to PO</ModalTitle></ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            <div className="text-xs text-gray-600">
              Awarded vendor: <strong>{awarded.vendor.name}</strong>{awarded.totalAmount && <> · Quoted ₹{awarded.totalAmount}</>}
            </div>
            <FormSection>
              <FormRow cols={2}>
                <Field label="PO #" required><Input value={poNumber} onChange={(e) => setPoNumber(e.target.value.toUpperCase())} /></Field>
                <Field label="PO Date" required><Input value={poDate} onChange={(e) => setPoDate(e.target.value)} placeholder="YYYY-MM-DD" /></Field>
              </FormRow>
              <FormRow cols={2}>
                <Field label="Delivery Date"><Input value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="YYYY-MM-DD" /></Field>
                <Field label="Payment Terms (days)"><NumberInput integerOnly value={paymentTermsDays} min={0} max={365} onChange={(v) => setPaymentTermsDays(v)} /></Field>
              </FormRow>
            </FormSection>

            <FormSection title="Per-line pricing">
              <div className="rounded border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="px-3 py-2" style={{ width: 120 }}>Unit Rate</th>
                      <th className="px-3 py-2" style={{ width: 90 }}>GST %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.lines.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">{l.item.code}</div>
                          <div className="text-xs text-gray-500">{l.item.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{l.quantity} {l.uom.code}</td>
                        <td className="px-3 py-2">
                          <NumberInput min={0}
                            value={lineRates[l.id].unitRate}
                            onChange={(v) => setLineRates({ ...lineRates, [l.id]: { ...lineRates[l.id], unitRate: v } })}
                            className="text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput min={0} max={100}
                            value={lineRates[l.id].gstRate}
                            onChange={(v) => setLineRates({ ...lineRates, [l.id]: { ...lineRates[l.id], gstRate: v } })}
                            className="text-xs text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormSection>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating PO…" : "Create PO"}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
