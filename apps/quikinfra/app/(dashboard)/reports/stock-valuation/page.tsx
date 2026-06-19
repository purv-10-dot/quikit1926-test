"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";

interface Row { projectName: string; locationName: string; itemCode: string; itemName: string; uomCode: string; qty: number; rate: number; value: number; }

export default function StockValuation() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { fetch("/api/reports/stock-valuation").then(r => r.json()).then(j => j.success && setRows(j.data)); }, []);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Reports</Link>
        <ExportButton
          filename="stock-valuation"
          rows={rows}
          columns={[
            { header: "Project", get: (r) => r.projectName },
            { header: "Location", get: (r) => r.locationName },
            { header: "Item Code", get: (r) => r.itemCode },
            { header: "Item Name", get: (r) => r.itemName },
            { header: "UOM", get: (r) => r.uomCode },
            { header: "Qty", get: (r) => r.qty },
            { header: "Rate", get: (r) => r.rate.toFixed(2) },
            { header: "Value", get: (r) => r.value.toFixed(2) },
          ]}
        />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Stock Valuation</h1>
      <p className="text-xs text-gray-500 mb-4">Current qty × moving-avg inbound rate. Total: <strong>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></p>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent-50 text-xs text-gray-600"><tr>
            <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">Location</th>
            <th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th>
            <th className="text-left px-3 py-2">UOM</th><th className="text-right px-3 py-2">Rate</th>
            <th className="text-right px-3 py-2">Value</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-2 text-xs text-gray-600">{r.projectName}</td>
              <td className="px-3 py-2 text-xs text-gray-600">{r.locationName}</td>
              <td className="px-3 py-2"><div className="text-xs font-mono">{r.itemCode}</div><div className="text-gray-700">{r.itemName}</div></td>
              <td className="px-3 py-2 text-right">{r.qty}</td>
              <td className="px-3 py-2 text-xs">{r.uomCode}</td>
              <td className="px-3 py-2 text-right text-gray-500">₹{r.rate.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-medium">₹{r.value.toFixed(2)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
