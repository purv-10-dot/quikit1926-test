"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";

interface Inv {
  id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null;
  subtotal: string; taxAmount: string;
  cgstAmount: string; sgstAmount: string; igstAmount: string; placeOfSupply: string | null;
  total: string; paidAmount: string; status: string;
  remarks: string | null;
  customer: { id: string; name: string; code: string; gstin: string | null } | null;
  project: { id: string; name: string; code: string } | null;
  rab: { id: string; rabNumber: string; rabDate: string } | null;
  allocations: Array<{ id: string; amount: string; receipt: { id: string; receiptNumber: string; receiptDate: string; mode: string } }>;
  lines: Array<{ id: string; description: string; quantity: string | null; uom: { code: string } | null; rate: string | null; amount: string; gstRate: string | null; taxAmount: string; remarks: string | null }>;
  creditNotes: Array<{ id: string; noteNumber: string; amount: string; noteDate: string; status: string }>;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Inv | null>(null);
  useEffect(() => { fetch(`/api/finance/invoices/${id}`).then(r => r.json()).then(j => j.success && setInv(j.data)); }, [id]);
  if (!inv) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const outstanding = Number(inv.total) - Number(inv.paidAmount);
  const meta = [
    { label: "Invoice #", value: inv.invoiceNumber },
    { label: "Date", value: new Date(inv.invoiceDate).toISOString().slice(0, 10) },
    { label: "Due", value: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : "—" },
    { label: "Status", value: inv.status },
    { label: "Customer", value: inv.customer?.name ?? "—" },
    { label: "GSTIN", value: inv.customer?.gstin ?? "—" },
    { label: "Project", value: inv.project?.name ?? "—" },
    { label: "Source RAB", value: inv.rab ? inv.rab.rabNumber : "—" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/finance/invoices" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Invoices</Link>
        <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noreferrer" className="text-xs bg-accent-600 text-white px-3 py-1 rounded hover:bg-accent-700">Print / PDF</a>
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">{inv.invoiceNumber}</h1>
      {inv.remarks && <p className="text-xs text-gray-600 mb-5">{inv.remarks}</p>}

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
          <div><div className="text-xs text-gray-500">Subtotal</div><div className="font-medium">₹{inv.subtotal}</div></div>
          <div><div className="text-xs text-gray-500">Tax</div><div className="font-medium">₹{inv.taxAmount}</div></div>
          <div><div className="text-xs text-gray-500">Total</div><div className="font-semibold text-gray-900">₹{inv.total}</div></div>
          <div><div className="text-xs text-gray-500">Outstanding</div><div className="font-semibold text-rose-700">₹{outstanding.toFixed(2)}</div></div>
        </div>
        {(Number(inv.cgstAmount) > 0 || Number(inv.sgstAmount) > 0 || Number(inv.igstAmount) > 0) && (
          <div className="grid grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-gray-100 text-gray-600">
            <div><span className="text-gray-400">CGST:</span> ₹{inv.cgstAmount}</div>
            <div><span className="text-gray-400">SGST:</span> ₹{inv.sgstAmount}</div>
            <div><span className="text-gray-400">IGST:</span> ₹{inv.igstAmount}</div>
            <div><span className="text-gray-400">Place of Supply:</span> {inv.placeOfSupply ?? "—"}</div>
          </div>
        )}
      </section>

      {inv.lines.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white mb-5">
          <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Line Items ({inv.lines.length})</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">UOM</th><th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">GST%</th>
              <th className="text-right px-3 py-2">Tax</th>
            </tr></thead>
            <tbody>{inv.lines.map(l => (
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

      {inv.creditNotes.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white mb-5">
          <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Credit Notes ({inv.creditNotes.length})</h2></div>
          <table className="w-full text-sm">
            <tbody>{inv.creditNotes.map(n => (
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Receipts allocated</h2>
        {inv.allocations.length === 0 ? (
          <div className="text-xs text-gray-500">None yet.</div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-accent-50 text-xs text-gray-600"><tr>
                <th className="text-left px-3 py-2">Receipt #</th><th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Mode</th><th className="text-right px-3 py-2">Amount</th>
              </tr></thead>
              <tbody>{inv.allocations.map(a => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs"><Link className="text-accent-700 hover:underline" href={`/finance/receipts/${a.receipt.id}`}>{a.receipt.receiptNumber}</Link></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(a.receipt.receiptDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs">{a.receipt.mode}</td>
                  <td className="px-3 py-2 text-right font-medium">₹{a.amount}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5">
        <DocumentAttachments refType="invoice" refId={inv.id} />
      </div>
    </div>
  );
}
