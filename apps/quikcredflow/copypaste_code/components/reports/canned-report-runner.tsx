"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Star } from "lucide-react";
import { CannedReportView, type ReportResult } from "./canned-report-view";
import { useReportFavorites } from "./use-report-favorites";

interface CannedReportRunnerProps {
  reportId: string;
  title: string;
  blurb: string;
  from: string;
  to: string;
  ownerId?: string;
  filterCaption: string;
}

export function CannedReportRunner({
  reportId,
  title,
  blurb,
  from,
  to,
  ownerId,
  filterCaption,
}: CannedReportRunnerProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggle } = useReportFavorites();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (ownerId) params.set("ownerId", ownerId);
    fetch(`/api/reports/canned/${reportId}?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as
          | { success: true; data: ReportResult }
          | { success: false; error: string };
        if (cancelled) return;
        if (!body.success) {
          setError(body.error);
          setResult(null);
        } else {
          setResult(body.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, from, to, ownerId]);

  function exportAs(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ from, to, format });
    if (ownerId) params.set("ownerId", ownerId);
    window.location.href = `/api/reports/canned/${reportId}?${params.toString()}`;
  }

  const fav = isFavorite(reportId);
  const libraryQs = new URLSearchParams({ from, to });
  if (ownerId) libraryQs.set("ownerId", ownerId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/reports/library?${libraryQs.toString()}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-accent-700 hover:underline"
          >
            <ArrowLeft size={16} />
            Back to library
          </Link>
          <h2 className="text-lg font-semibold text-crm-text">{title}</h2>
          <p className="mt-1 text-sm text-crm-muted">{blurb}</p>
        </div>
        <button
          type="button"
          onClick={() => toggle(reportId)}
          className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${
            fav
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-crm-border bg-white text-crm-muted hover:border-accent-300"
          }`}
        >
          <Star size={16} className={fav ? "fill-amber-500 text-amber-500" : ""} />
          {fav ? "Favorited" : "Add to favorites"}
        </button>
      </div>

      <CannedReportView
        result={result}
        loading={loading}
        error={error}
        filterCaption={filterCaption}
        onExport={exportAs}
        exportDisabled={loading}
      />
    </div>
  );
}
