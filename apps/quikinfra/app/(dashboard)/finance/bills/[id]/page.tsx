"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";

interface Bill {
  id: string; billNumber: string; billDate: string; dueDate: string | null;
  subtotal: string; taxAmount: string;
  cgstAmount: string; sgstAmount: string; igstAmount: string; placeOfSupply: string | null;
  total: string; paidAmount: string; status: string;
  supplierInvoiceNo: string | null; supplierInvoiceDate: string | null; remarks: string | null;
  vendor: { id: string; name: string; code: string; gstin: string | null } | null;
  project: { id: string; name: string; code: string } | null;
  grn: { id: string; grnNumber: string; grnDate: string } | null;
  po: { id: string; poNumber: string } | null;
  allocations: Array<{ id: string; amount: string; payment: { id: string; paymentNumber: string; paymentDate: string; mode: string } }>;
  lines: Array<{ id: string; description: string; quantity: string | null; uom: { code: string } | null; rate: string | null; amount: string; gstRate: string | null; taxAmount: string; remarks: string | null }>;
  debitNotes: Array<{ id: string; noteNumber: string; amount: string; noteDate: string; status: string }>;
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  useEffect(() => { fetch(`/api/finance/bills/${id}`).then(r => r.json()).then(j => j.success && setBill(j.data)); }, [id]);
  if (!bill) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const outstanding = Number(bill.total) - Number(bill.paidAmount);
  const meta = [
    { label: "Bill #", value: bill.billNumber },
    { label: "Date", value: new Date(bill.billDate).toISOString().slice(0, 10) },
    { label: "Due", value: bill.dueDate ? new Date(bill.dueDate).toISOString().slice(0, 10) : "—" },
    { label: "Status", value: bill.status },
    { label: "Vendor", value: bill.vendor?.name ?? "—" },
    { label: "GSTIN", value: bill.vendor?.gstin ?? "—" },
    { label: "Project", value: bill.project?.name ?? "—" },
    { label: "GRN", value: bill.grn?.grnNumber ?? "—" },
    { label: "PO", value: bill.po?.poNumber ?? "—" },
    { label: "Supplier Inv #", value: bill.supplierInvoiceNo ?? "—" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/finance/bills" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Bills</Link>
        <a href={`/print/bill/${bill.id}`} target="_blank" rel="noreferrer" className="text-xs bg-accent-600 text-white px-3 py-1 rounded hover:bg-accent-700">Print / PDF</a>
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">{bill.billNumber}</h1>
      {bill.remarks && <p className="text-xs text-gray-600 mb-5">{bill.remarks}</p>}

      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
          {meta.map((m, i) => (
            <div key={i} className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div>
              <div className="text-sm text-gray-900 mt-0.5 break-words">{m.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Amounts</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-gray-500">Subtotal</div><div className="font-medium">₹{bill.subtotal}</div></div>
          <div><div className="text-xs text-gray-500">Tax</div><div className="font-medium">₹{bill.taxAmount}</div></div>
          <div><div className="text-xs text-gray-500">Total</div><div className="font-semibold text-gray-900">₹{bill.total}</div></div>
          <div><div className="text-xs text-gray-500">Outstanding</div><div className="font-semibold text-rose-700">₹{outstanding.toFixed(2)}</div></div>
        </div>
        {(Number(bill.cgstAmount) > 0 || Number(bill.sgstAmount) > 0 || Number(bill.igstAmount) > 0) && (
          <div className="grid grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-gray-100 text-gray-600">
            <div><span className="text-gray-400">CGST:</span> ₹{bill.cgstAmount}</div>
            <div><span className="text-gray-400">SGST:</span> ₹{bill.sgstAmount}</div>
            <div><span className="text-gray-400">IGST:</span> ₹{bill.igstAmount}</div>
            <div><span className="text-gray-400">Place of Supply:</span> {bill.placeOfSupply ?? "—"}</div>
          </div>
        )}
      </section>

      {bill.lines.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white mb-5">
          <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Line Items ({bill.lines.length})</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">UOM</th><th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">GST%</th>
              <th className="text-right px-3 py-2">Tax</th>
            </tr></thead>
            <tbody>{bill.lines.map(l => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{l.description}</td>
                <td className="px-3 py-2 text-right">{l.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{l.uom?.code ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-500">{l.rate ? `₹${l.rate}` : "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{l.amount}</td>
                <td className="px-3 py-2 text-right text-xs">{l.gstRate ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-500">₹{l.taxAmount}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {bill.debitNotes.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white mb-5">
          <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Debit Notes ({bill.debitNotes.length})</h2></div>
          <table className="w-full text-sm">
            <tbody>{bill.debitNotes.map(n => (
              <tr key={n.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{n.noteNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(n.noteDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs">{n.status}</td>
                <td className="px-3 py-2 text-right font-medium">₹{n.amount}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Payments allocated</h2>
        {bill.allocations.length === 0 ? (
          <div className="text-xs text-gray-500">None yet.</div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-accent-50 text-xs text-gray-600"><tr>
                <th className="text-left px-3 py-2">Payment #</th><th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Mode</th><th className="text-right px-3 py-2">Amount</th>
              </tr></thead>
              <tbody>{bill.allocations.map(a => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs"><Link className="text-accent-700 hover:underline" href={`/finance/payments/${a.payment.id}`}>{a.payment.paymentNumber}</Link></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(a.payment.paymentDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs">{a.payment.mode}</td>
                  <td className="px-3 py-2 text-right font-medium">₹{a.amount}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5">
        <DocumentAttachments refType="bill" refId={bill.id} />
      </div>
    </div>
  );
}
