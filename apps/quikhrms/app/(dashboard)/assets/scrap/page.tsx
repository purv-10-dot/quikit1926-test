"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Trash2, Search, IndianRupee, Package } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { AssetTabs } from "../_components/asset-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";

interface ScrapEvent {
  id: string;
  quantity: number;
  reason: string;
  scrapDate: string;
  scrapValue: string | number | null;
  markedLost: boolean;
  scrappedBy: string;
  notes: string | null;
  asset: {
    id: string; assetCode: string; name: string; category: string;
    brand: string | null; model: string | null;
    purchasePrice: string | number | null;
  };
}

interface ScrapResponse {
  items: ScrapEvent[];
  summary: { totalEvents: number; totalUnits: number; totalScrapValue: string | number };
}

export default function ScrapInventoryPage() {
  const api = useApiClient();
  const [filters, setFilters] = useState({ search: "", reason: "" });

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (filters.search) qs.set("search", filters.search);
  if (filters.reason) qs.set("reason", filters.reason);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", "scrap", filters],
    queryFn: () => api.get<ScrapResponse>(`/api/v1/hrms/assets/scrap?${qs.toString()}`),
  });

  const items = data?.data?.items ?? [];
  const summary = data?.data?.summary ?? { totalEvents: 0, totalUnits: 0, totalScrapValue: 0 };

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<Trash2 size={28} className="text-red-500" />}
        title="Scrap inventory"
        subtitle="All scrap events."
      />
      <div className="mb-5"><AssetTabs /></div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase mb-1"><Trash2 size={12} /> Scrap events</div>
          <div className="text-2xl font-semibold text-gray-900">{summary.totalEvents}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase mb-1"><Package size={12} /> Units scrapped</div>
          <div className="text-2xl font-semibold text-gray-900">{summary.totalUnits}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase mb-1"><IndianRupee size={12} /> Recovery total</div>
          <div className="text-2xl font-semibold text-green-600">₹{Number(summary.totalScrapValue).toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder="Search..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
        </div>
        <Select
          value={filters.reason}
          onChange={(v) => setFilters({ ...filters, reason: v })}
          placeholder="All"
          options={[
            { value: "", label: "All scrap" },
            { value: "retired", label: "Retired" },
            { value: "lost", label: "Lost" },
          ]}
          className="w-40"
        />
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={6} /> : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Trash2 size={32} className="mx-auto mb-2 text-gray-300" /> No scrap events
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Code</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Qty</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-right px-4 py-2">Recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((s, i) => (
                <tr key={s.id} className="row-stagger hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/assets/${s.asset.id}`} className="text-[#3b82f6] hover:underline">{s.asset.assetCode}</Link>
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">{s.asset.name}
                    {s.asset.brand && <div className="text-xs text-gray-400">{s.asset.brand} {s.asset.model}</div>}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{s.asset.category}</span></td>
                  <td className="px-4 py-2 text-xs font-semibold text-gray-900">{s.quantity}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.markedLost ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                    }`}>{s.markedLost ? "Lost" : "Retired"}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {new Date(s.scrapDate).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-700">{s.reason}</td>
                  <td className="px-4 py-2 text-right text-xs font-medium text-green-600">
                    {s.scrapValue ? `₹${Number(s.scrapValue).toLocaleString("en-IN")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
