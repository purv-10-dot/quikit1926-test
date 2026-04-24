"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Receipt as ReceiptIcon, ArrowLeft, Eye, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ExportButton } from "@/components/ui/ExportButton";

interface Bill {
  id: string; billNumber: string; billDate: string; dueDate: string | null;
  total: string; paidAmount: string; status: string;
  supplierInvoiceNo: string | null;
  vendor: { name: string; code: string } | null;
  project: { name: string } | null;
  grn: { grnNumber: string } | null;
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", approved: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700", paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function BillsPage() {
  const [items, setItems] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/bills"); const j = await r.json();
    if (j.success) setItems(j.data);
    else toast.error(j.error ?? "Failed to load bills");
    setLoading(false);
  }, [toast]);
  useEffect(() => { refresh(); }, [refresh]);

  async function generateFromGrn() {
    const grnId = prompt("GRN ID to bill (must be posted):");
    if (!grnId) return;
    const billNumber = prompt("Bill #:", `BILL-${Date.now().toString().slice(-6)}`);
    if (!billNumber) return;
    const billDate = prompt("Bill date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!billDate) return;
    const dueDate = prompt("Due date (YYYY-MM-DD, optional):") || null;
    const supplierInvoiceNo = prompt("Supplier invoice # (optional):") || null;
    const r = await fetch(`/api/finance/bills/from-grn/${grnId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billNumber, billDate, dueDate, supplierInvoiceNo }),
    });
    const j = await r.json();
    if (!j.success) toast.error(j.error ?? "Generate failed");
    else { toast.success(`Bill ${billNumber} created`); refresh(); }
  }

  async function approve(b: Bill) {
    const ok = await confirm({ title: "Approve this bill?", description: b.billNumber, confirmLabel: "Approve" });
    if (!ok) return;
    const res = await fetch(`/api/finance/bills/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
    const j = await res.json();
    if (!j.success) toast.error(j.error ?? "Approval failed");
    else { toast.success(`Bill ${b.billNumber} approved`); refresh(); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Vendor Bills</h1>
          <p className="text-xs text-gray-500">Supplier bills. Generate from posted GRNs or create standalone.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename="vendor-bills"
            rows={items}
            columns={[
              { header: "Bill #", get: (b) => b.billNumber },
              { header: "Vendor", get: (b) => b.vendor?.name ?? "" },
              { header: "Project", get: (b) => b.project?.name ?? "" },
              { header: "GRN", get: (b) => b.grn?.grnNumber ?? "" },
              { header: "Supplier Inv", get: (b) => b.supplierInvoiceNo ?? "" },
              { header: "Date", get: (b) => new Date(b.billDate).toISOString().slice(0, 10) },
              { header: "Due", get: (b) => b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : "" },
              { header: "Total", get: (b) => b.total },
              { header: "Paid", get: (b) => b.paidAmount },
              { header: "Outstanding", get: (b) => (Number(b.total) - Number(b.paidAmount)).toFixed(2) },
              { header: "Status", get: (b) => b.status },
            ]}
          />
          <AddButton onClick={generateFromGrn}>Generate from GRN</AddButton>
        </div>
      </div>
      {loading ? <TableSkeleton rows={6} cols={12} /> : items.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="No bills yet" message="Generate vendor bills from posted GRNs." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Bill #</th><th className="text-left px-3 py-2">Vendor</th>
              <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">GRN</th>
              <th className="text-left px-3 py-2">Supplier Inv</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Due</th>
              <th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Paid</th>
              <th className="text-right px-3 py-2">Outstanding</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 80 }}></th>
            </tr></thead>
            <tbody>{items.map(b => {
              const outstanding = Number(b.total) - Number(b.paidAmount);
              return (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{b.billNumber}</td>
                  <td className="px-3 py-2 text-gray-700">{b.vendor?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{b.project?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-accent-700">{b.grn?.grnNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{b.supplierInvoiceNo ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(b.billDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">₹{b.total}</td>
                  <td className="px-3 py-2 text-right text-gray-700">₹{b.paidAmount}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">₹{outstanding.toFixed(2)}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[b.status] ?? "bg-gray-100 text-gray-600"}`}>{b.status}</span></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/finance/bills/${b.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                    {b.status === "draft" && <button onClick={() => approve(b)} className="text-gray-400 hover:text-green-600 p-1" title="Approve"><CheckCircle className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
