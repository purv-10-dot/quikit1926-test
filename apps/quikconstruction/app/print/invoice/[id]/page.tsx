"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Inv {
  id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null;
  subtotal: string; taxAmount: string; cgstAmount: string; sgstAmount: string; igstAmount: string; placeOfSupply: string | null;
  total: string; paidAmount: string; status: string; remarks: string | null;
  customer: { name: string; code: string; gstin: string | null; address: string | null; city: string | null; state: string | null } | null;
  project: { name: string; code: string } | null;
  rab: { rabNumber: string } | null;
  lines: Array<{ id: string; description: string; quantity: string | null; uom: { code: string } | null; rate: string | null; amount: string; gstRate: string | null; taxAmount: string }>;
}

function inWords(n: number): string {
  // Basic English-rupees spelling for small numbers. Production should use `number-to-words` lib.
  if (n === 0) return "Zero";
  return `${n.toLocaleString("en-IN")} only`;
}

export default function PrintInvoice() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Inv | null>(null);
  useEffect(() => { fetch(`/api/finance/invoices/${id}`).then(r => r.json()).then(j => j.success && setInv(j.data)); }, [id]);
  if (!inv) return <div style={{ padding: 40, fontSize: 12 }}>Loading…</div>;

  const outstanding = Number(inv.total) - Number(inv.paidAmount);
  const addr = [inv.customer?.address, inv.customer?.city, inv.customer?.state].filter(Boolean).join(", ");

  return (
    <>
      <div className="print-action"><button onClick={() => window.print()}>Print / Save PDF</button></div>

      <div className="doc-head">
        <div>
          <div className="company">QuikConstruction</div>
          <div style={{ fontSize: 10, color: "#555" }}>Tax Invoice</div>
        </div>
        <div className="doc-meta">
          <div style={{ fontSize: 16, fontWeight: 600 }}>{inv.invoiceNumber}</div>
          <div>Date: {new Date(inv.invoiceDate).toISOString().slice(0, 10)}</div>
          {inv.dueDate && <div>Due: {new Date(inv.dueDate).toISOString().slice(0, 10)}</div>}
          <div style={{ textTransform: "uppercase", fontWeight: 600, color: inv.status === "paid" ? "#0a7" : inv.status === "cancelled" ? "#c33" : "#333", marginTop: 4 }}>{inv.status}</div>
        </div>
      </div>

      <div className="kv-grid">
        <div>
          <div className="label">Bill To</div>
          <div className="value">{inv.customer?.name ?? "—"}</div>
          {addr && <div style={{ fontSize: 11 }}>{addr}</div>}
          {inv.customer?.gstin && <div style={{ fontSize: 10 }}>GSTIN: {inv.customer.gstin}</div>}
        </div>
        <div>
          <div className="label">Project</div>
          <div className="value">{inv.project?.name ?? "—"}</div>
          {inv.project?.code && <div style={{ fontSize: 10 }}>Code: {inv.project.code}</div>}
          {inv.rab && <div style={{ fontSize: 10 }}>RAB Ref: {inv.rab.rabNumber}</div>}
          {inv.placeOfSupply && <div style={{ fontSize: 10 }}>Place of Supply: {inv.placeOfSupply}</div>}
        </div>
      </div>

      {inv.lines.length > 0 && (
        <>
          <h2>Line Items</h2>
          <table>
            <thead><tr>
              <th>#</th><th>Description</th>
              <th className="num">Qty</th><th>UOM</th>
              <th className="num">Rate</th><th className="num">Amount</th>
              <th className="num">GST%</th><th className="num">Tax</th>
            </tr></thead>
            <tbody>{inv.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.description}</td>
                <td className="num">{l.quantity ?? "—"}</td>
                <td>{l.uom?.code ?? "—"}</td>
                <td className="num">{l.rate ? `₹${l.rate}` : "—"}</td>
                <td className="num">₹{l.amount}</td>
                <td className="num">{l.gstRate ? `${l.gstRate}%` : "—"}</td>
                <td className="num">₹{l.taxAmount}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      <div className="totals">
        <div><span>Subtotal</span><span>₹{inv.subtotal}</span></div>
        {Number(inv.cgstAmount) > 0 && <div><span>CGST</span><span>₹{inv.cgstAmount}</span></div>}
        {Number(inv.sgstAmount) > 0 && <div><span>SGST</span><span>₹{inv.sgstAmount}</span></div>}
        {Number(inv.igstAmount) > 0 && <div><span>IGST</span><span>₹{inv.igstAmount}</span></div>}
        {Number(inv.cgstAmount) === 0 && Number(inv.sgstAmount) === 0 && Number(inv.igstAmount) === 0 && (
          <div><span>Tax</span><span>₹{inv.taxAmount}</span></div>
        )}
        <div className="grand"><span>Total</span><span>₹{inv.total}</span></div>
        <div><span>Paid</span><span>₹{inv.paidAmount}</span></div>
        <div style={{ fontWeight: 600, color: outstanding > 0 ? "#c33" : "#0a7" }}><span>Outstanding</span><span>₹{outstanding.toFixed(2)}</span></div>
      </div>

      <div className="tbl-note">Amount in words: INR {inWords(Number(inv.total))}</div>

      {inv.remarks && <div style={{ marginTop: "4mm", fontSize: 11 }}><strong>Remarks:</strong> {inv.remarks}</div>}

      <div className="sig-block">
        <div className="sig">Customer signature</div>
        <div className="sig">For QuikConstruction</div>
      </div>

      <div className="footer">
        <div>This is a system-generated invoice.</div>
        <div>Generated {new Date().toISOString().slice(0, 16).replace("T", " ")}</div>
      </div>
    </>
  );
}
