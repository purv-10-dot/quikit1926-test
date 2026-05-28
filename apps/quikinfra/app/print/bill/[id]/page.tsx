"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Bill {
  id: string; billNumber: string; billDate: string; dueDate: string | null;
  supplierInvoiceNo: string | null; supplierInvoiceDate: string | null;
  subtotal: string; taxAmount: string; cgstAmount: string; sgstAmount: string; igstAmount: string; placeOfSupply: string | null;
  total: string; paidAmount: string; status: string; remarks: string | null;
  vendor: { name: string; code: string; gstin: string | null; address: string | null; city: string | null; state: string | null } | null;
  project: { name: string; code: string } | null;
  grn: { grnNumber: string } | null;
  po: { poNumber: string } | null;
  lines: Array<{ id: string; description: string; quantity: string | null; uom: { code: string } | null; rate: string | null; amount: string; gstRate: string | null; taxAmount: string }>;
}

export default function PrintBill() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  useEffect(() => { fetch(`/api/finance/bills/${id}`).then(r => r.json()).then(j => j.success && setBill(j.data)); }, [id]);
  if (!bill) return <div style={{ padding: 40 }}>Loading…</div>;
  const outstanding = Number(bill.total) - Number(bill.paidAmount);
  const addr = [bill.vendor?.address, bill.vendor?.city, bill.vendor?.state].filter(Boolean).join(", ");

  return (
    <>
      <div className="print-action"><button onClick={() => window.print()}>Print / Save PDF</button></div>
      <div className="doc-head">
        <div><div className="company">QuikInfra</div><div style={{ fontSize: 10, color: "#555" }}>Vendor Bill (Payable)</div></div>
        <div className="doc-meta">
          <div style={{ fontSize: 16, fontWeight: 600 }}>{bill.billNumber}</div>
          <div>Bill Date: {new Date(bill.billDate).toISOString().slice(0, 10)}</div>
          {bill.dueDate && <div>Due: {new Date(bill.dueDate).toISOString().slice(0, 10)}</div>}
          <div style={{ textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>{bill.status}</div>
        </div>
      </div>

      <div className="kv-grid">
        <div>
          <div className="label">Vendor</div>
          <div className="value">{bill.vendor?.name ?? "—"}</div>
          {addr && <div style={{ fontSize: 11 }}>{addr}</div>}
          {bill.vendor?.gstin && <div style={{ fontSize: 10 }}>GSTIN: {bill.vendor.gstin}</div>}
        </div>
        <div>
          <div className="label">References</div>
          <div style={{ fontSize: 11 }}>Project: {bill.project?.name ?? "—"}</div>
          {bill.grn && <div style={{ fontSize: 10 }}>GRN: {bill.grn.grnNumber}</div>}
          {bill.po && <div style={{ fontSize: 10 }}>PO: {bill.po.poNumber}</div>}
          {bill.supplierInvoiceNo && <div style={{ fontSize: 10 }}>Supplier Inv: {bill.supplierInvoiceNo}</div>}
          {bill.placeOfSupply && <div style={{ fontSize: 10 }}>Place of Supply: {bill.placeOfSupply}</div>}
        </div>
      </div>

      {bill.lines.length > 0 && (
        <>
          <h2>Line Items</h2>
          <table>
            <thead><tr><th>#</th><th>Description</th><th className="num">Qty</th><th>UOM</th><th className="num">Rate</th><th className="num">Amount</th><th className="num">GST%</th><th className="num">Tax</th></tr></thead>
            <tbody>{bill.lines.map((l, i) => (
              <tr key={l.id}><td>{i + 1}</td><td>{l.description}</td><td className="num">{l.quantity ?? "—"}</td><td>{l.uom?.code ?? "—"}</td><td className="num">{l.rate ? `₹${l.rate}` : "—"}</td><td className="num">₹{l.amount}</td><td className="num">{l.gstRate ? `${l.gstRate}%` : "—"}</td><td className="num">₹{l.taxAmount}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}

      <div className="totals">
        <div><span>Subtotal</span><span>₹{bill.subtotal}</span></div>
        {Number(bill.cgstAmount) > 0 && <div><span>CGST</span><span>₹{bill.cgstAmount}</span></div>}
        {Number(bill.sgstAmount) > 0 && <div><span>SGST</span><span>₹{bill.sgstAmount}</span></div>}
        {Number(bill.igstAmount) > 0 && <div><span>IGST</span><span>₹{bill.igstAmount}</span></div>}
        {Number(bill.cgstAmount) === 0 && Number(bill.sgstAmount) === 0 && Number(bill.igstAmount) === 0 && (<div><span>Tax</span><span>₹{bill.taxAmount}</span></div>)}
        <div className="grand"><span>Total</span><span>₹{bill.total}</span></div>
        <div><span>Paid</span><span>₹{bill.paidAmount}</span></div>
        <div style={{ fontWeight: 600 }}><span>Outstanding</span><span>₹{outstanding.toFixed(2)}</span></div>
      </div>

      {bill.remarks && <div style={{ marginTop: "4mm", fontSize: 11 }}><strong>Remarks:</strong> {bill.remarks}</div>}
      <div className="footer"><div>System-generated.</div><div>{new Date().toISOString().slice(0, 16).replace("T", " ")}</div></div>
    </>
  );
}
