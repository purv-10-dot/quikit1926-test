"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState } from "@quikit/ui";
import { FileText, ArrowLeft, Eye } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ExportButton } from "@/components/ui/ExportButton";

interface Invoice {
  id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null;
  total: string; paidAmount: string; status: string;
  customer: { name: string; code: string } | null;
  project: { name: string } | null;
  rab: { rabNumber: string } | null;
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700", paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function InvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/invoices"); const j = await r.json();
    if (j.success) setItems(j.data);
    else toast.error(j.error ?? "Failed to load invoices");
    setLoading(false);
  }, [toast]);
  useEffect(() => { refresh(); }, [refresh]);

  async function generateFromRab() {
    const rabId = prompt("RAB ID to invoice (must be approved):");
    if (!rabId) return;
    const invoiceNumber = prompt("Invoice #:", `INV-${Date.now().toString().slice(-6)}`);
    if (!invoiceNumber) return;
    const invoiceDate = prompt("Invoice date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!invoiceDate) return;
    const dueDate = prompt("Due date (YYYY-MM-DD, optional):") || null;
    const r = await fetch(`/api/finance/invoices/from-rab/${rabId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber, invoiceDate, dueDate }),
    });
    const j = await r.json();
    if (!j.success) toast.error(j.error ?? "Generate failed");
    else { toast.success(`Invoice ${invoiceNumber} created`); refresh(); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Client Invoices</h1>
          <p className="text-xs text-gray-500">Bills issued to clients. Generate from approved RABs or create standalone.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename="invoices"
            rows={items}
            columns={[
              { header: "Invoice #", get: (i) => i.invoiceNumber },
              { header: "Customer", get: (i) => i.customer?.name ?? "" },
              { header: "Project", get: (i) => i.project?.name ?? "" },
              { header: "Date", get: (i) => new Date(i.invoiceDate).toISOString().slice(0, 10) },
              { header: "Due", get: (i) => i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : "" },
              { header: "Total", get: (i) => i.total },
              { header: "Paid", get: (i) => i.paidAmount },
              { header: "Outstanding", get: (i) => (Number(i.total) - Number(i.paidAmount)).toFixed(2) },
              { header: "Status", get: (i) => i.status },
            ]}
          />
          <AddButton onClick={generateFromRab}>Generate from RAB</AddButton>
        </div>
      </div>
      {loading ? <TableSkeleton rows={6} cols={11} /> : items.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" message="Generate invoices from approved RABs." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Invoice #</th><th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">RAB</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Due</th>
              <th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Paid</th>
              <th className="text-right px-3 py-2">Outstanding</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{items.map(i => {
              const outstanding = Number(i.total) - Number(i.paidAmount);
              return (
                <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{i.invoiceNumber}</td>
                  <td className="px-3 py-2 text-gray-700">{i.customer?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{i.project?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-accent-700">{i.rab?.rabNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(i.invoiceDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">₹{i.total}</td>
                  <td className="px-3 py-2 text-right text-gray-700">₹{i.paidAmount}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">₹{outstanding.toFixed(2)}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[i.status] ?? "bg-gray-100 text-gray-600"}`}>{i.status}</span></td>
                  <td className="px-3 py-2"><Link href={`/finance/invoices/${i.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
