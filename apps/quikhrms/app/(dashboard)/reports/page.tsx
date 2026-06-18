"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { FileSpreadsheet, FileText, FileType, Eye, Search } from "lucide-react";
import { clsx } from "clsx";

interface CatalogItem {
  key: string;
  label: string;
  description: string;
  category: string;
  usesDateRange: boolean;
}

interface PreviewResult {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

type Format = "csv" | "xlsx" | "pdf";

export default function ReportsPage() {
  const api = useApiClient();
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // `${key}:${format|preview}`

  const { data: catalogRes, isLoading } = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => api.get<CatalogItem[]>("/api/v1/hrms/reports/catalog"),
  });
  const catalog = catalogRes?.data ?? [];

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? catalog.filter((c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      : catalog;
    const map = new Map<string, CatalogItem[]>();
    for (const c of filtered) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return [...map.entries()];
  }, [catalog, search]);

  const body = (item: CatalogItem) => ({
    key: item.key,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const handlePreview = async (item: CatalogItem) => {
    setBusy(`${item.key}:preview`);
    try {
      const res = await api.post<PreviewResult>("/api/v1/hrms/reports/generate", { ...body(item), format: "json" });
      setPreview(res.data);
      if (res.data.totalRows === 0) toast.info("No data", `${item.label} returned 0 rows for the current filters.`);
    } catch (e) {
      toast.error("Preview failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (item: CatalogItem, format: Format) => {
    setBusy(`${item.key}:${format}`);
    try {
      await api.downloadPost("/api/v1/hrms/reports/generate", { ...body(item), format }, `${item.key}.${format}`);
      toast.success("Report downloaded", `${item.label} (${format.toUpperCase()})`);
    } catch (e) {
      toast.error("Download failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const fmtBtn = "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition disabled:opacity-50";

  return (
    <div className="w-full px-6 py-6 space-y-5">
      <div>
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">{catalog.length} reports across payroll, statutory, attendance, leave, recruitment and more. Export as CSV, Excel or PDF.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Search reports</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. PF, CTC, attendance…" className="w-full border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-sm" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading report catalogue…</div>
      ) : (
        grouped.map(([category, items]) => (
          <section key={category}>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">{category} <span className="text-gray-400 font-medium">({items.length})</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => (
                <div key={item.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col">
                  <div className="flex items-start gap-2">
                    <FileSpreadsheet size={18} className="text-[#3b82f6] mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 text-sm leading-tight">{item.label}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    <button onClick={() => handlePreview(item)} disabled={!!busy} className={clsx(fmtBtn, "border-gray-300 text-gray-700 hover:bg-gray-50")}>
                      <Eye size={12} /> {busy === `${item.key}:preview` ? "…" : "Preview"}
                    </button>
                    <button onClick={() => handleDownload(item, "csv")} disabled={!!busy} className={clsx(fmtBtn, "border-emerald-300 text-emerald-700 hover:bg-emerald-50")}>
                      <FileText size={12} /> {busy === `${item.key}:csv` ? "…" : "CSV"}
                    </button>
                    <button onClick={() => handleDownload(item, "xlsx")} disabled={!!busy} className={clsx(fmtBtn, "border-green-300 text-green-700 hover:bg-green-50")}>
                      <FileSpreadsheet size={12} /> {busy === `${item.key}:xlsx` ? "…" : "Excel"}
                    </button>
                    <button onClick={() => handleDownload(item, "pdf")} disabled={!!busy} className={clsx(fmtBtn, "border-red-300 text-red-700 hover:bg-red-50")}>
                      <FileType size={12} /> {busy === `${item.key}:pdf` ? "…" : "PDF"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{preview.title} — {preview.totalRows} rows</h2>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-700 text-sm">Close ✕</button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-200">
                    {preview.columns.map((c) => (
                      <th key={c.key} className="text-left px-3 py-2 font-medium text-gray-500 uppercase whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {preview.columns.map((c) => (
                        <td key={c.key} className="px-3 py-1.5 text-gray-700 max-w-[240px] truncate">
                          {row[c.key] == null ? "—" : typeof row[c.key] === "object" ? JSON.stringify(row[c.key]) : String(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.totalRows > 100 && <div className="p-2 text-center text-xs text-gray-400 border-t border-gray-100">Showing 100 of {preview.totalRows} rows — download for full data.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
