"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";

interface Row { projectId: string; code: string; name: string; status: string; value: number | null; revenue: number; revenuePaid: number; billsCost: number; billsPaid: number; materialsCost: number; expensesCost: number; labourCost: number; totalCost: number; margin: number; marginPct: number; }

export default function ProjectPnl() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { fetch("/api/reports/project-pnl").then(r => r.json()).then(j => j.success && setRows(j.data)); }, []);

  const totals = rows.reduce((t, r) => ({
    revenue: t.revenue + r.revenue,
    billsCost: t.billsCost + r.billsCost,
    materialsCost: t.materialsCost + r.materialsCost,
    expensesCost: t.expensesCost + r.expensesCost,
    labourCost: t.labourCost + r.labourCost,
    totalCost: t.totalCost + r.totalCost,
    margin: t.margin + r.margin,
  }), { revenue: 0, billsCost: 0, materialsCost: 0, expensesCost: 0, labourCost: 0, totalCost: 0, margin: 0 });

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><ArrowLeft className="h-3 w-3" /> Reports</Link>
        <ExportButton
          filename="project-pnl"
          rows={rows}
          columns={[
            { header: "Project", get: (r) => r.name },
            { header: "Code", get: (r) => r.code },
            { header: "Status", get: (r) => r.status },
            { header: "Contract Value", get: (r) => r.value ?? "" },
            { header: "Revenue", get: (r) => r.revenue.toFixed(2) },
            { header: "Revenue Collected", get: (r) => r.revenuePaid.toFixed(2) },
            { header: "Bills Cost", get: (r) => r.billsCost.toFixed(2) },
            { header: "Materials Cost", get: (r) => r.materialsCost.toFixed(2) },
            { header: "Expenses", get: (r) => r.expensesCost.toFixed(2) },
            { header: "Labour", get: (r) => r.labourCost.toFixed(2) },
            { header: "Total Cost", get: (r) => r.totalCost.toFixed(2) },
            { header: "Margin", get: (r) => r.margin.toFixed(2) },
            { header: "Margin %", get: (r) => r.marginPct.toFixed(1) },
          ]}
        />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Project P&L</h1>
      <p className="text-xs text-gray-500 mb-4">Revenue − (vendor bills + materials via DPR + expenses + labour). Labour distributed from finalized payroll by attendance-days per project.</p>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent-50 text-xs text-gray-600"><tr>
            <th className="text-left px-3 py-2">Project</th><th className="text-left px-3 py-2">Status</th>
            <th className="text-right px-3 py-2">Contract</th>
            <th className="text-right px-3 py-2">Revenue</th>
            <th className="text-right px-3 py-2">Bills</th>
            <th className="text-right px-3 py-2">Materials</th>
            <th className="text-right px-3 py-2">Expenses</th>
            <th className="text-right px-3 py-2">Labour</th>
            <th className="text-right px-3 py-2">Total Cost</th>
            <th className="text-right px-3 py-2">Margin</th>
            <th className="text-right px-3 py-2">%</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.projectId} className="border-t border-gray-100">
              <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-[10px] font-mono text-gray-500">{r.code}</div></td>
              <td className="px-3 py-2 text-xs">{r.status}</td>
              <td className="px-3 py-2 text-right text-xs text-gray-500">{r.value != null ? `₹${r.value.toLocaleString("en-IN")}` : "—"}</td>
              <td className="px-3 py-2 text-right font-medium">₹{r.revenue.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right text-gray-700">₹{r.billsCost.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right text-gray-700">₹{r.materialsCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className="px-3 py-2 text-right text-gray-700">₹{r.expensesCost.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right text-gray-700">₹{r.labourCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className="px-3 py-2 text-right font-medium">₹{r.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className={`px-3 py-2 text-right font-semibold ${r.margin < 0 ? "text-red-700" : "text-green-700"}`}>₹{r.margin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className={`px-3 py-2 text-right text-xs ${r.marginPct < 0 ? "text-red-700" : "text-green-700"}`}>{r.marginPct.toFixed(1)}%</td>
            </tr>
          ))}</tbody>
          <tfoot className="bg-gray-50 text-xs font-semibold"><tr>
            <td colSpan={3} className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right">₹{totals.revenue.toLocaleString("en-IN")}</td>
            <td className="px-3 py-2 text-right">₹{totals.billsCost.toLocaleString("en-IN")}</td>
            <td className="px-3 py-2 text-right">₹{totals.materialsCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
            <td className="px-3 py-2 text-right">₹{totals.expensesCost.toLocaleString("en-IN")}</td>
            <td className="px-3 py-2 text-right">₹{totals.labourCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
            <td className="px-3 py-2 text-right">₹{totals.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
            <td className={`px-3 py-2 text-right ${totals.margin < 0 ? "text-red-700" : "text-green-700"}`}>₹{totals.margin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
            <td className="px-3 py-2"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}
