"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";

interface Row { vendorId: string; code: string; name: string; rating: number | null; poCount: number; grnCount: number; totalPoAmount: number; totalGrnAmount: number; grnOnTimePct: number | null; qualityAcceptPct: number | null; }

function pctClass(p: number | null) {
  if (p == null) return "text-gray-400";
  if (p >= 90) return "text-green-700";
  if (p >= 70) return "text-amber-700";
  return "text-red-700";
}

export default function VendorPerformance() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { fetch("/api/reports/vendor-performance").then(r => r.json()).then(j => j.success && setRows(j.data)); }, []);
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Reports</Link>
        <ExportButton
          filename="vendor-performance"
          rows={rows}
          columns={[
            { header: "Code", get: (r) => r.code },
            { header: "Name", get: (r) => r.name },
            { header: "Rating", get: (r) => r.rating ?? "" },
            { header: "POs", get: (r) => r.poCount },
            { header: "GRNs", get: (r) => r.grnCount },
            { header: "PO Amount", get: (r) => r.totalPoAmount.toFixed(2) },
            { header: "GRN Amount", get: (r) => r.totalGrnAmount.toFixed(2) },
            { header: "On-time %", get: (r) => r.grnOnTimePct?.toFixed(1) ?? "" },
            { header: "Quality %", get: (r) => r.qualityAcceptPct?.toFixed(1) ?? "" },
          ]}
        />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Vendor Performance</h1>
      <p className="text-xs text-gray-500 mb-4">On-time delivery and quality acceptance based on posted GRNs.</p>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent-50 text-xs text-gray-600"><tr>
            <th className="text-left px-3 py-2">Vendor</th><th className="text-right px-3 py-2">Rating</th>
            <th className="text-right px-3 py-2">POs</th><th className="text-right px-3 py-2">GRNs</th>
            <th className="text-right px-3 py-2">PO ₹</th><th className="text-right px-3 py-2">GRN ₹</th>
            <th className="text-right px-3 py-2">On-time %</th><th className="text-right px-3 py-2">Quality %</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.vendorId} className="border-t border-gray-100">
              <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-[10px] text-gray-500">{r.code}</div></td>
              <td className="px-3 py-2 text-right text-xs">{r.rating ?? "—"}</td>
              <td className="px-3 py-2 text-right">{r.poCount}</td>
              <td className="px-3 py-2 text-right">{r.grnCount}</td>
              <td className="px-3 py-2 text-right">₹{r.totalPoAmount.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right">₹{r.totalGrnAmount.toLocaleString("en-IN")}</td>
              <td className={`px-3 py-2 text-right font-medium ${pctClass(r.grnOnTimePct)}`}>{r.grnOnTimePct != null ? `${r.grnOnTimePct.toFixed(0)}%` : "—"}</td>
              <td className={`px-3 py-2 text-right font-medium ${pctClass(r.qualityAcceptPct)}`}>{r.qualityAcceptPct != null ? `${r.qualityAcceptPct.toFixed(0)}%` : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
