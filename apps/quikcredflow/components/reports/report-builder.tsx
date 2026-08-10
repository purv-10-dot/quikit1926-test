"use client";

/**
 * HubSpot/Salesforce-style report builder:
 * object → group by (field or time bucket) → metric → filters → chart → run.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Plus, Save, Trash2 } from "lucide-react";
import { ReportsToolbar } from "./reports-toolbar";
import { CannedReportView, type ReportResult } from "./canned-report-view";
import { operatorsForFieldType } from "@/lib/services/reports/custom/catalog";
import type {
  CustomReportChartType,
  CustomReportObjectMeta,
  ReportFilter,
  ReportFilterOperator,
} from "@/lib/services/reports/custom/types";

interface ReportBuilderProps {
  ownerOptions: { value: string; label: string }[];
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

const SAVED_KEY = "quikcrm.reports.custom.saved.v1";

type SavedDef = {
  id: string;
  title: string;
  object: string;
  groupBy: string;
  metric: string;
  filters?: ReportFilter[];
  chartType?: CustomReportChartType;
};

function loadSaved(): SavedDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedDef[]) : [];
  } catch {
    return [];
  }
}

const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  equals: "equals",
  not_equals: "not equals",
  contains: "contains",
  in: "is any of",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

const CHART_OPTIONS: { value: CustomReportChartType; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
];

function needsValue(op: ReportFilterOperator): boolean {
  return op !== "is_empty" && op !== "is_not_empty";
}

export function ReportBuilder({ ownerOptions }: ReportBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Memoize so the fallback `to` stays stable across renders.
  const fallback = useMemo(defaultRange, []);
  const from = searchParams.get("from") || fallback.from;
  const to = searchParams.get("to") || fallback.to;
  const ownerId = searchParams.get("ownerId") || "";

  const [catalog, setCatalog] = useState<CustomReportObjectMeta[]>([]);
  const [object, setObject] = useState<string>("leads");
  const [groupBy, setGroupBy] = useState<string>("source");
  const [metric, setMetric] = useState<string>("count");
  const [chartType, setChartType] = useState<CustomReportChartType>("auto");
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedDef[]>([]);

  const meta = catalog.find((o) => o.object === object);

  useEffect(() => {
    fetch("/api/reports/custom/catalog")
      .then(async (res) => {
        const body = (await res.json()) as
          | { success: true; data: { objects: CustomReportObjectMeta[] } }
          | { success: false };
        if (body.success) setCatalog(body.data.objects);
      })
      .catch(() => {});
    setSaved(loadSaved());
  }, []);

  useEffect(() => {
    if (!meta) return;
    if (!meta.groupByFields.some((f) => f.key === groupBy)) {
      setGroupBy(meta.groupByFields[0]?.key ?? "");
    }
    if (!meta.metrics.some((m) => m.key === metric)) {
      setMetric(meta.metrics[0]?.key ?? "count");
    }
  }, [meta, groupBy, metric]);

  const setUrl = useCallback(
    (patch: { from?: string; to?: string; ownerId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.from !== undefined) params.set("from", patch.from);
      if (patch.to !== undefined) params.set("to", patch.to);
      if (patch.ownerId !== undefined) {
        if (patch.ownerId) params.set("ownerId", patch.ownerId);
        else params.delete("ownerId");
      }
      router.replace(`/reports/builder?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  function changeObject(next: string) {
    setObject(next);
    setFilters([]); // filter fields are object-specific
  }

  function addFilter() {
    const first = meta?.filterFields[0];
    if (!first) return;
    const op = operatorsForFieldType(first.type)[0] ?? "equals";
    setFilters((prev) => [
      ...prev,
      { field: first.key, operator: op, value: first.type === "boolean" ? "true" : "" },
    ]);
  }

  function updateFilter(index: number, patch: Partial<ReportFilter>) {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function changeFilterField(index: number, fieldKey: string) {
    const fieldMeta = meta?.filterFields.find((f) => f.key === fieldKey);
    const op = fieldMeta ? operatorsForFieldType(fieldMeta.type)[0] : "equals";
    updateFilter(index, {
      field: fieldKey,
      operator: op,
      value: fieldMeta?.type === "boolean" ? "true" : "",
    });
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  async function runReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/custom/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          object,
          groupBy,
          metric,
          title: title.trim() || undefined,
          filters: filters.length ? filters : undefined,
          chartType: chartType !== "auto" ? chartType : undefined,
          from,
          to,
          ownerId: ownerId || undefined,
        }),
      });
      const body = (await res.json()) as
        | { success: true; data: ReportResult }
        | { success: false; error: string };
      if (!body.success) {
        setError(body.error);
        setResult(null);
      } else {
        setResult(body.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Run failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function saveDefinition() {
    const label =
      title.trim() ||
      `${meta?.label ?? object} by ${meta?.groupByFields.find((f) => f.key === groupBy)?.label ?? groupBy}`;
    const entry: SavedDef = {
      id: `custom-${Date.now()}`,
      title: label,
      object,
      groupBy,
      metric,
      filters: filters.length ? filters : undefined,
      chartType: chartType !== "auto" ? chartType : undefined,
    };
    const next = [entry, ...saved].slice(0, 12);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setSaved(next);
  }

  function loadSavedDef(def: SavedDef) {
    setObject(def.object);
    setGroupBy(def.groupBy);
    setMetric(def.metric);
    setTitle(def.title);
    setFilters(def.filters ?? []);
    setChartType(def.chartType ?? "auto");
  }

  function deleteSavedDef(id: string) {
    setSaved((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }

  const ownerLabel =
    ownerOptions.find((o) => o.value === ownerId)?.label ?? "All agents";
  const fmtDay = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };
  const filterCaption = `${fmtDay(from)} → ${fmtDay(to)} · ${ownerLabel}`;

  return (
    <div>
      <ReportsToolbar
        from={from}
        to={to}
        ownerId={ownerId}
        ownerOptions={ownerOptions}
        onChange={(next) => setUrl(next)}
      />

      <div className="mb-6 grid gap-4 rounded-xl border border-crm-border bg-white p-4 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">1. Object</span>
          <select
            value={object}
            onChange={(e) => changeObject(e.target.value)}
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          >
            {catalog.map((o) => (
              <option key={o.object} value={o.object}>
                {o.label}
              </option>
            ))}
          </select>
          {meta && (
            <span className="mt-1 block text-[11px] text-crm-muted">
              Date: {meta.dateFieldLabel}
            </span>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">2. Group by</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          >
            {meta?.groupByFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">3. Metric</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          >
            {meta?.metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">4. Chart</span>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as CustomReportChartType)}
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          >
            {CHART_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block font-medium text-crm-text">Report name (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My custom report"
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          />
        </label>

        {/* Filters */}
        <div className="lg:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-crm-text">Filters</span>
            <button
              type="button"
              onClick={addFilter}
              disabled={!meta || meta.filterFields.length === 0}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-crm-border bg-white px-2 text-xs font-medium hover:border-accent-400 hover:bg-accent-50 disabled:opacity-50"
            >
              <Plus size={13} />
              Add filter
            </button>
          </div>
          {filters.length === 0 ? (
            <p className="text-[11px] text-crm-muted">
              No filters — report covers all {meta?.label.toLowerCase() ?? "records"} in
              the selected range.
            </p>
          ) : (
            <div className="space-y-2">
              {filters.map((f, i) => {
                const fieldMeta = meta?.filterFields.find((ff) => ff.key === f.field);
                const ops = fieldMeta ? operatorsForFieldType(fieldMeta.type) : [];
                const showValue = needsValue(f.operator);
                const valueType = fieldMeta?.type ?? "string";
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      value={f.field}
                      onChange={(e) => changeFilterField(i, e.target.value)}
                      className="rounded-md border border-crm-border px-2 py-1.5 text-xs"
                    >
                      {meta?.filterFields.map((ff) => (
                        <option key={ff.key} value={ff.key}>
                          {ff.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) =>
                        updateFilter(i, {
                          operator: e.target.value as ReportFilterOperator,
                        })
                      }
                      className="rounded-md border border-crm-border px-2 py-1.5 text-xs"
                    >
                      {ops.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    {showValue &&
                      (valueType === "user" ? (
                        <select
                          value={f.value ?? ""}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}
                          className="w-44 rounded-md border border-crm-border px-2 py-1.5 text-xs"
                        >
                          <option value="">Select…</option>
                          {ownerOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : valueType === "boolean" ? (
                        <select
                          value={f.value ?? "true"}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}
                          className="rounded-md border border-crm-border px-2 py-1.5 text-xs"
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <input
                          type={
                            valueType === "number"
                              ? "number"
                              : valueType === "date"
                                ? "date"
                                : "text"
                          }
                          value={f.value ?? ""}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}
                          placeholder={f.operator === "in" ? "comma,separated" : "value"}
                          className="w-40 rounded-md border border-crm-border px-2 py-1.5 text-xs"
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() => removeFilter(i)}
                      aria-label="Remove filter"
                      className="rounded-md p-1 text-crm-muted hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2 lg:col-span-4">
          <button
            type="button"
            onClick={() => void runReport()}
            disabled={loading || !meta}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Play size={16} />
            Run report
          </button>
          <button
            type="button"
            onClick={saveDefinition}
            disabled={!meta}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-crm-border bg-white px-3 text-sm font-medium hover:border-accent-400 hover:bg-accent-50"
          >
            <Save size={16} />
            Save to My reports
          </button>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">
            My saved reports
          </h3>
          <div className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full border border-crm-border bg-white py-1 pl-3 pr-1 text-xs hover:border-accent-300"
              >
                <button
                  type="button"
                  onClick={() => loadSavedDef(s)}
                  className="hover:text-accent-700"
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedDef(s.id)}
                  aria-label={`Delete saved report ${s.title}`}
                  title="Delete saved report"
                  className="rounded-full p-0.5 text-crm-muted hover:bg-crm-panel hover:text-red-600"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <CannedReportView
        result={result}
        loading={loading}
        error={error}
        filterCaption={filterCaption}
      />
    </div>
  );
}
