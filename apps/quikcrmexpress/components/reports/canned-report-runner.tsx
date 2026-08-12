"use client";

import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { CannedReportView } from "./canned-report-view";
import { useCannedReport } from "./use-canned-report";
import { useReportFavorites } from "./use-report-favorites";

interface CannedReportRunnerProps {
  reportId: string;
  title: string;
  blurb: string;
  from: string;
  to: string;
  ownerId?: string;
  filterCaption: string;
  canExport?: boolean;
}

export function CannedReportRunner({
  reportId,
  title,
  blurb,
  from,
  to,
  ownerId,
  filterCaption,
  canExport,
}: CannedReportRunnerProps) {
  const { result, loading, error } = useCannedReport({
    reportId,
    from,
    to,
    ownerId,
  });
  const { isFavorite, toggle } = useReportFavorites();

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
        canExport={canExport}
      />
    </div>
  );
}
