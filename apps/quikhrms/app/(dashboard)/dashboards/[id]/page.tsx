"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import {
  ChevronLeft, Filter, MoreVertical, Download, Plus, RefreshCw, Printer, Link as LinkIcon, Trash2, ChevronRight,
  BarChart3, Users, Star, BadgeCheck, DollarSign, UserPlus,
  Briefcase, Clock, CheckCircle2, UserCheck, Globe, TrendingUp, ArrowUpRight, Wallet,
} from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { Widget, type WidgetConfig } from "../_components/widget-renderer";

const WIDGET_CATALOG: { type: string; title: string }[] = [
  { type: "headcount-trend", title: "Headcount Trend" },
  { type: "turnover-rate", title: "Turnover Rate" },
  { type: "attrition-rate", title: "Attrition Rate" },
  { type: "new-hires", title: "New Hires" },
  { type: "terminations", title: "Terminations" },
  { type: "headcount-by-department", title: "Headcount by Department" },
  { type: "headcount-by-gender", title: "Headcount by Gender" },
  { type: "headcount-by-location", title: "Headcount by Location" },
  { type: "tenure-distribution", title: "Tenure Distribution" },
  { type: "age-distribution", title: "Age Distribution" },
  { type: "open-positions", title: "Open Positions" },
  { type: "hires-count", title: "Hires" },
  { type: "time-to-hire", title: "Avg. Time to Hire (days)" },
  { type: "offer-acceptance-rate", title: "Offer Acceptance Rate" },
  { type: "candidates-interviewed", title: "Candidates Interviewed" },
  { type: "recruitment-sources", title: "Recruitment Sources" },
  { type: "pipeline-funnel", title: "Pipeline by Stage" },
  { type: "aging-requisitions", title: "Open Roles by Age" },
  { type: "top-hiring-departments", title: "Top Hiring Departments" },
  { type: "top-sources-by-hires", title: "Top Sources by Hires" },
  { type: "open-positions-by-department", title: "Open Positions by Department" },
  { type: "promotions-this-year", title: "Promotions This Year" },
  { type: "internal-mobility", title: "Internal Mobility" },
  { type: "salary-by-department", title: "Salary by Department" },
  { type: "ctc-spend", title: "CTC Spend" },
];

// Widget types whose result is a single metric — rendered in the compact
// KPI strip rather than the chart grid.
const METRIC_WIDGETS = new Set<string>([
  "open-positions", "time-to-hire", "offer-acceptance-rate",
  "candidates-interviewed", "recruitment-sources", "hires-count",
  "promotions-this-year", "internal-mobility", "ctc-spend",
]);

// Icon per metric type for the KPI tiles.
const KPI_ICONS: Record<string, LucideIcon> = {
  "open-positions": Briefcase,
  "hires-count": UserCheck,
  "time-to-hire": Clock,
  "offer-acceptance-rate": CheckCircle2,
  "candidates-interviewed": Users,
  "recruitment-sources": Globe,
  "promotions-this-year": ArrowUpRight,
  "internal-mobility": TrendingUp,
  "ctc-spend": Wallet,
};

const DASHBOARD_ICONS: Record<string, LucideIcon> = {
  BarChart3, Users, Star, BadgeCheck, DollarSign, UserPlus,
};

interface WidgetExportData {
  type: string;
  metric?: { value: number; format: string };
  series?: { label: string; value: number }[];
  rolling?: { label: string; value: number }[];
  pie?: { name: string; value: number }[];
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  iconName: string | null;
  color: string | null;
  isPrebuilt: boolean;
  widgets: WidgetConfig[];
}

export default function DashboardDetailPage() {
  const api = useApiClient();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [months, setMonths] = useState(12);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboards", id],
    queryFn: () => api.get<Dashboard>(`/api/v1/hrms/dashboards/${id}`),
  });
  const d = data?.data;

  const updateMut = useMutation({
    mutationFn: (widgets: WidgetConfig[]) => api.put(`/api/v1/hrms/dashboards/${id}`, { widgets }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards", id] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/dashboards/${id}`),
    onSuccess: () => {
      toast.success("Dashboard deleted");
      qc.invalidateQueries({ queryKey: ["dashboards", "all"] });
      router.push("/dashboards");
    },
  });

  const addWidget = (type: string, title: string) => {
    if (!d) return;
    const newWidget: WidgetConfig = { id: crypto.randomUUID(), type, title };
    updateMut.mutate([...(d.widgets ?? []), newWidget]);
    toast.success("Widget added", title);
  };

  const handleDownloadCsv = async () => {
    if (!d?.widgets?.length) return;
    setDownloading(true);
    try {
      const results = await Promise.all(
        d.widgets.map((w) =>
          api.get<WidgetExportData>(`/api/v1/hrms/dashboards/widget-data?type=${w.type}&months=${months}`).then((r) => ({ widget: w, data: r.data })),
        ),
      );

      const sections: string[] = [];
      sections.push(`# ${d.name}`);
      sections.push(`# Period: Last ${months} months`);
      sections.push(`# Generated: ${new Date().toLocaleString("en-IN")}`);
      sections.push("");

      for (const { widget, data: wd } of results) {
        sections.push(`## ${widget.title}`);
        if (wd.metric) {
          sections.push("metric,value,format");
          sections.push(`${escapeCsv(widget.title)},${escapeCsv(wd.metric.value)},${escapeCsv(wd.metric.format)}`);
        }
        if (wd.series?.length) {
          sections.push("");
          sections.push("series_label,series_value");
          for (const p of wd.series) sections.push(`${escapeCsv(p.label)},${escapeCsv(p.value)}`);
        }
        if (wd.rolling?.length) {
          sections.push("");
          sections.push("rolling_label,rolling_value");
          for (const p of wd.rolling) sections.push(`${escapeCsv(p.label)},${escapeCsv(p.value)}`);
        }
        if (wd.pie?.length) {
          sections.push("");
          sections.push("pie_name,pie_value");
          for (const p of wd.pie) sections.push(`${escapeCsv(p.name)},${escapeCsv(p.value)}`);
        }
        sections.push("");
        sections.push("");
      }

      const csv = "﻿" + sections.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      a.href = url;
      a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Dashboard downloaded", `${results.length} widgets exported`);
    } catch (e) {
      toast.error("Download failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDownloading(false);
    }
  };

  const HeroIcon = d ? (DASHBOARD_ICONS[d.iconName ?? "BarChart3"] ?? BarChart3) : BarChart3;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 py-4 pb-24">
      {isLoading || !d ? (
        <>
          {/* Hero skeleton */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-200 to-slate-100 h-28 animate-pulse mb-5" />
          {/* Widget skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 h-72 animate-pulse" />
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#166534] via-[#15803d] to-[#16a34a] text-white px-5 py-4 shadow-md mb-5">
            <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
            <div className="absolute -right-24 bottom-0 w-64 h-64 rounded-full bg-[#22c55e]/10 blur-3xl pointer-events-none" />
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <HeroIcon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-serif-display text-base font-semibold leading-tight">{d.name}</h1>
                  {d.isPrebuilt && (
                    <span className="text-[11px] px-2 py-0.5 bg-white/15 backdrop-blur text-white rounded font-medium uppercase tracking-wide ring-1 ring-white/20">
                      Pre-built by Quikit
                    </span>
                  )}
                </div>
                {d.description && <p className="text-xs text-white/75 mt-1 max-w-2xl">{d.description}</p>}
                <div className="mt-3 flex items-center gap-2 text-[11px] text-white/70">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 ring-1 ring-white/15">
                    {d.widgets?.length ?? 0} widgets
                  </span>
                  <span>•</span>
                  <span>Period: last {months} months</span>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Select
                value={String(months)}
                onChange={(v) => setMonths(Number(v))}
                options={[
                  { value: "3", label: "Last 3 months" },
                  { value: "6", label: "Last 6 months" },
                  { value: "12", label: "Last 12 months" },
                  { value: "24", label: "Last 24 months" },
                ]}
                className="w-44"
              />
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 transition">
                <Filter size={13} /> Filters
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadCsv}
                disabled={downloading || !d.widgets?.length}
                className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {downloading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Download size={13} className="transition-transform group-hover:translate-y-0.5" />
                    Download CSV
                  </>
                )}
              </button>
              <ActionsMenu
                isPrebuilt={!!d.isPrebuilt}
                existingTypes={new Set((d.widgets ?? []).map((w) => w.type))}
                onAddWidget={addWidget}
                onRefresh={() => { refetch(); toast.success("Refreshed"); }}
                onPrint={() => window.print()}
                onCopyLink={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied");
                }}
                onDelete={() => { if (confirm(`Delete "${d.name}"? This cannot be undone.`)) deleteMut.mutate(); }}
              />
            </div>
          </div>

          {/* Widgets — split into a compact KPI strip (metric widgets) and a
              chart grid (everything else), mirroring a BI dashboard layout. */}
          {d.widgets.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
              <BarChart3 size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-[13px] font-semibold text-gray-700">No widgets yet</p>
              <p className="text-xs text-gray-500 mt-1">Add some via the Actions menu.</p>
            </div>
          ) : (
            (() => {
              const kpiWidgets = d.widgets.filter((w) => METRIC_WIDGETS.has(w.type));
              const chartWidgets = d.widgets.filter((w) => !METRIC_WIDGETS.has(w.type));
              return (
                <div className="space-y-4">
                  {kpiWidgets.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {kpiWidgets.map((w) => (
                        <Widget key={w.id} config={w} months={months} variant="kpi" kpiIcon={KPI_ICONS[w.type]} />
                      ))}
                    </div>
                  )}
                  {chartWidgets.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {chartWidgets.map((w) => (
                        <div key={w.id} className="transition-transform hover:-translate-y-0.5">
                          <Widget config={w} months={months} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}

function ActionsMenu({
  isPrebuilt, existingTypes, onAddWidget, onRefresh, onPrint, onCopyLink, onDelete,
}: {
  isPrebuilt: boolean;
  existingTypes: Set<string>;
  onAddWidget: (type: string, title: string) => void;
  onRefresh: () => void;
  onPrint: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdd(false);
      }
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const close = () => { setOpen(false); setShowAdd(false); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition ${open ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
      >
        <MoreVertical size={13} /> Actions
      </button>
      {open && !showAdd && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2"><Plus size={13} /> Add widget</span>
            <ChevronRight size={12} className="text-gray-400" />
          </button>
          <button type="button" onClick={() => { close(); onRefresh(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <RefreshCw size={13} /> Refresh data
          </button>
          <button type="button" onClick={() => { close(); onPrint(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <Printer size={13} /> Print
          </button>
          <button type="button" onClick={() => { close(); onCopyLink(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <LinkIcon size={13} /> Copy link
          </button>
          {!isPrebuilt && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button type="button" onClick={() => { close(); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                <Trash2 size={13} /> Delete dashboard
              </button>
            </>
          )}
        </div>
      )}
      {open && showAdd && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 text-xs font-semibold text-gray-700">
            <button type="button" onClick={() => setShowAdd(false)} className="p-0.5 rounded hover:bg-gray-100">
              <ChevronLeft size={13} />
            </button>
            Add widget
          </div>
          <div className="overflow-y-auto py-1">
            {WIDGET_CATALOG.map((w) => {
              const exists = existingTypes.has(w.type);
              return (
                <button
                  key={w.type}
                  type="button"
                  disabled={exists}
                  onClick={() => { close(); onAddWidget(w.type, w.title); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>{w.title}</span>
                  {exists && <span className="text-[10px] text-gray-400">added</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
