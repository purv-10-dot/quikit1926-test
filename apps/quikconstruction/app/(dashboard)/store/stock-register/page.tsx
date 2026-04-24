"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@quikit/ui";
import { Warehouse, ArrowLeft } from "lucide-react";

interface StockRow {
  projectId: string;
  projectName: string;
  locationId: string;
  locationName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  totalValue: number;
}

export default function StockRegisterPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = projectFilter ? `/api/store/stock-ledger?projectId=${projectFilter}` : "/api/store/stock-ledger";
      const res = await fetch(url);
      const j = await res.json();
      if (j.success) setRows(j.data);
    } finally { setLoading(false); }
  }, [projectFilter]);

  useEffect(() => {
    refresh();
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
  }, [refresh]);

  return (
    <div className="p-6 max-w-7xl">
      <Link href="/store" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Store
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Stock Register</h1>
          <p className="text-xs text-gray-500">
            Aggregate balance per item × location. Computed from <code className="bg-gray-100 px-1 rounded">CnStockLedger</code> at query time.
          </p>
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Warehouse} title="No stock yet" message="Post a GRN to see stock appear here." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-right px-3 py-2">In</th>
                <th className="text-right px-3 py-2">Out</th>
                <th className="text-right px-3 py-2">Balance</th>
                <th className="text-right px-3 py-2">UOM</th>
                <th className="text-right px-3 py-2">Value ₹</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.projectId}:${r.locationId}:${r.itemId}`} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/store/stock-register/drill?projectId=${r.projectId}&locationId=${r.locationId}&itemId=${r.itemId}`}
                      className="font-mono text-xs text-accent-700 hover:underline"
                    >
                      {r.itemCode}
                    </Link>
                    <div className="text-xs text-gray-500">{r.itemName}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{r.projectName}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{r.locationName}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.qtyIn.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.qtyOut.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${r.balance < 0 ? "text-red-600" : r.balance === 0 ? "text-gray-400" : "text-gray-900"}`}>
                    {r.balance.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">{r.uomCode}</td>
                  <td className="px-3 py-2 text-right text-gray-700">₹{r.totalValue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
