"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState } from "@quikit/ui";
import { CreditCard, ArrowLeft } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { PaymentFormPanel } from "./_components/PaymentFormPanel";

interface Payment {
  id: string; paymentNumber: string; paymentDate: string;
  amount: string; allocatedAmount: string; mode: string; reference: string | null;
  vendor: { name: string; code: string } | null;
  _count: { allocations: number };
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/finance/payments"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/finance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Finance</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Vendor Payments</h1>
          <p className="text-xs text-gray-500">Money paid to vendors. Allocate across one or more bills.</p>
        </div>
        <AddButton onClick={() => setOpen(true)}>Record Payment</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" message="Record money paid to a vendor." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Payment #</th><th className="text-left px-3 py-2">Vendor</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Mode</th>
              <th className="text-left px-3 py-2">Reference</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Allocated</th>
              <th className="text-right px-3 py-2"># Bills</th>
            </tr></thead>
            <tbody>{items.map(p => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{p.paymentNumber}</td>
                <td className="px-3 py-2 text-gray-700">{p.vendor?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(p.paymentDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs">{p.mode}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{p.reference ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">₹{p.amount}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{p.allocatedAmount}</td>
                <td className="px-3 py-2 text-right text-gray-500">{p._count.allocations}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <PaymentFormPanel open={open} onClose={() => setOpen(false)} onSaved={refresh} />
    </div>
  );
}
