"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState } from "@quikit/ui";
import { Wallet, ArrowLeft } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ReceiptFormPanel } from "./_components/ReceiptFormPanel";

interface Receipt {
  id: string; receiptNumber: string; receiptDate: string;
  amount: string; allocatedAmount: string; mode: string; reference: string | null;
  customer: { name: string; code: string } | null;
  _count: { allocations: number };
}

export default function ReceiptsPage() {
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/receipts"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Client Receipts</h1>
          <p className="text-xs text-gray-500">Money received from clients. Allocate across one or more invoices.</p>
        </div>
        <AddButton onClick={() => setOpen(true)}>Record Receipt</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Wallet} title="No receipts yet" message="Record money received from a client." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Receipt #</th><th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Mode</th>
              <th className="text-left px-3 py-2">Reference</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Allocated</th>
              <th className="text-right px-3 py-2"># Invoices</th>
            </tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs"><Link className="text-accent-700 hover:underline" href={`/finance/receipts/${r.id}`}>{r.receiptNumber}</Link></td>
                <td className="px-3 py-2 text-gray-700">{r.customer?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.receiptDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs">{r.mode}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.reference ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{r.amount}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{r.allocatedAmount}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r._count.allocations}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <ReceiptFormPanel open={open} onClose={() => setOpen(false)} onSaved={refresh} />
    </div>
  );
}
