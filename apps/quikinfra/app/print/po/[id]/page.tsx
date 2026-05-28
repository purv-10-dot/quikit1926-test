"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Line { id: string; orderedQty: string; unitRate: string; amount: string; gstRate: string | null; taxAmount: string; totalAmount: string; item: { code: string; name: string } | null; uom: { code: string } | null }
interface Po {
  id: string; poNumber: string; poDate: string; deliveryDate: string | null;
  subtotal: string; taxAmount: string; totalAmount: string; paymentTermsDays: number | null;
  status: string; remarks: string | null;
  vendor: { name: string; gstin: string | null; address: string | null; city: string | null; state: string | null } | null;
  project: { name: string; code: string } | null;
  deliveryLocation: { name: string; address: string | null } | null;
  lines: Line[];
}

export default function PrintPo() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<Po | null>(null);
  useEffect(() => { fetch(`/api/purchase/orders/${id}`).then(r => r.json()).then(j => j.success && setPo(j.data)); }, [id]);
  if (!po) return <div style={{ padding: 40 }}>Loading…</div>;
  const vAddr = [po.vendor?.address, po.vendor?.city, po.vendor?.state].filter(Boolean).join(", ");

  return (
    <>
      <div className="print-action"><button onClick={() => window.print()}>Print / Save PDF</button></div>
      <div className="doc-head">
        <div><div className="company">QuikInfra</div><div style={{ fontSize: 10, color: "#555" }}>Purchase Order</div></div>
        <div className="doc-meta">
          <div style={{ fontSize: 16, fontWeight: 600 }}>{po.poNumber}</div>
          <div>Date: {new Date(po.poDate).toISOString().slice(0, 10)}</div>
          {po.deliveryDate && <div>Delivery: {new Date(po.deliveryDate).toISOString().slice(0, 10)}</div>}
          <div style={{ textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>{po.status}</div>
        </div>
      </div>

      <div className="kv-grid">
        <div>
          <div className="label">Vendor</div>
          <div className="value">{po.vendor?.name ?? "—"}</div>
          {vAddr && <div style={{ fontSize: 11 }}>{vAddr}</div>}
          {po.vendor?.gstin && <div style={{ fontSize: 10 }}>GSTIN: {po.vendor.gstin}</div>}
        </div>
        <div>
          <div className="label">Project / Deliver To</div>
          <div style={{ fontSize: 11 }}>Project: {po.project?.name ?? "—"}</div>
          {po.deliveryLocation && <div style={{ fontSize: 10 }}>Location: {po.deliveryLocation.name}{po.deliveryLocation.address ? ` — ${po.deliveryLocation.address}` : ""}</div>}
          {po.paymentTermsDays != null && <div style={{ fontSize: 10 }}>Payment: {po.paymentTermsDays} days</div>}
        </div>
      </div>

      <h2>Line Items</h2>
      <table>
        <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th>UOM</th><th className="num">Rate</th><th className="num">Amount</th><th className="num">GST%</th><th className="num">Tax</th><th className="num">Total</th></tr></thead>
        <tbody>{po.lines.map((l, i) => (
          <tr key={l.id}>
            <td>{i + 1}</td>
            <td>{l.item ? `${l.item.code} — ${l.item.name}` : "—"}</td>
            <td className="num">{l.orderedQty}</td>
            <td>{l.uom?.code ?? "—"}</td>
            <td className="num">₹{l.unitRate}</td>
            <td className="num">₹{l.amount}</td>
            <td className="num">{l.gstRate ? `${l.gstRate}%` : "—"}</td>
            <td className="num">₹{l.taxAmount}</td>
            <td className="num">₹{l.totalAmount}</td>
          </tr>
        ))}</tbody>
      </table>

      <div className="totals">
        <div><span>Subtotal</span><span>₹{po.subtotal}</span></div>
        <div><span>Tax</span><span>₹{po.taxAmount}</span></div>
        <div className="grand"><span>Total</span><span>₹{po.totalAmount}</span></div>
      </div>

      {po.remarks && <div style={{ marginTop: "4mm", fontSize: 11 }}><strong>Remarks:</strong> {po.remarks}</div>}
      <div className="sig-block"><div className="sig">Vendor acknowledgment</div><div className="sig">For QuikInfra</div></div>
      <div className="footer"><div>System-generated PO.</div><div>{new Date().toISOString().slice(0, 16).replace("T", " ")}</div></div>
    </>
  );
}
