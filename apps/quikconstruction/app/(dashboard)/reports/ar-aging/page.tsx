"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";

interface Row { invoiceId: string; invoiceNumber: string; customer: string; daysOverdue: number; bucket: string; outstanding: number; }
interface Data { buckets: { current: number; d30: number; d60: number; d90: number; over90: number }; rows: Row[] }

export default function ArAging() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { fetch("/api/reports/ar-aging").then(r => r.json()).then(j => j.success && setData(j.data)); }, []);
  if (!data) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  const buckets = [
    { label: "Current (not due)", v: data.buckets.current, color: "bg-green-50 text-green-700" },
    { label: "1–30 days", v: data.buckets.d30, color: "bg-amber-50 text-amber-700" },
    { label: "31–60 days", v: data.buckets.d60, color: "bg-orange-50 text-orange-700" },
    { label: "61–90 days", v: data.buckets.d90, color: "bg-red-50 text-red-700" },
    { label: "90+ days", v: data.buckets.over90, color: "bg-red-100 text-red-800" },
  ];
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Reports</Link>
        <ExportButton
          filename="ar-aging"
          rows={data.rows}
          columns={[
            { header: "Invoice #", get: (r) => r.invoiceNumber },
            { header: "Customer", get: (r) => r.customer },
            { header: "Days Overdue", get: (r) => r.daysOverdue },
            { header: "Bucket", get: (r) => r.bucket },
            { header: "Outstanding", get: (r) => r.outstanding.toFixed(2) },
          ]}
        />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-4">AR Aging</h1>
      <div className="grid grid-cols-5 gap-2 mb-5">
        {buckets.map(b => (
          <div key={b.label} className={`rounded-lg border border-gray-200 p-3 ${b.color}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide">{b.label}</div>
            <div className="text-sm font-semibold mt-1">₹{b.v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent-50 text-xs text-gray-600"><tr>
            <th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Customer</th>
            <th className="text-right px-3 py-2">Days</th><th className="text-left px-3 py-2">Bucket</th>
            <th className="text-right px-3 py-2">Outstanding</th>
          </tr></thead>
          <tbody>{data.rows.map(r => (
            <tr key={r.invoiceId} className="border-t border-gray-100">
              <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber}</td>
              <td className="px-3 py-2 text-gray-700">{r.customer}</td>
              <td className="px-3 py-2 text-right">{r.daysOverdue}</td>
              <td className="px-3 py-2 text-xs">{r.bucket}</td>
              <td className="px-3 py-2 text-right font-medium">₹{r.outstanding.toFixed(2)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
