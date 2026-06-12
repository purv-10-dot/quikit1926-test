"use client";

/**
 * HubSpot/Salesforce-style report builder: object → group by → metric → run.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Save } from "lucide-react";
import { ReportsToolbar } from "./reports-toolbar";
import { CannedReportView, type ReportResult } from "./canned-report-view";
import type { CustomReportObjectMeta } from "@/lib/services/reports/custom/types";

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

export function ReportBuilder({ ownerOptions }: ReportBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fallback = defaultRange();
  const from = searchParams.get("from") || fallback.from;
  const to = searchParams.get("to") || fallback.to;
  const ownerId = searchParams.get("ownerId") || "";

  const [catalog, setCatalog] = useState<CustomReportObjectMeta[]>([]);
  const [object, setObject] = useState<string>("leads");
  const [groupBy, setGroupBy] = useState<string>("source");
  const [metric, setMetric] = useState<string>("count");
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
            onChange={(e) => setObject(e.target.value)}
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
          <span className="mb-1 block font-medium text-crm-text">Report name (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My custom report"
            className="w-full rounded-md border border-crm-border px-2 py-2 text-sm"
          />
        </label>

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
              <button
                key={s.id}
                type="button"
                onClick={() => loadSavedDef(s)}
                className="rounded-full border border-crm-border bg-white px-3 py-1 text-xs hover:border-accent-300 hover:bg-accent-50"
              >
                {s.title}
              </button>
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
