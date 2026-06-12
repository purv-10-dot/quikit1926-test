"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { CannedReportView, type ReportResult } from "./canned-report-view";

interface DrawerProps {
  reportId: string;
  title: string;
  blurb: string;
  open: boolean;
  onClose: () => void;
  from: string;
  to: string;
  ownerId?: string;
  filterCaption?: string;
}

export function CannedReportDrawer({
  reportId,
  title,
  blurb,
  open,
  onClose,
  from,
  to,
  ownerId,
  filterCaption,
}: DrawerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reportId, from, to, ownerId]);

  function exportAs(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ from, to, format });
    if (ownerId) params.set("ownerId", ownerId);
    window.location.href = `/api/reports/canned/${reportId}?${params.toString()}`;
  }

  const fullPageHref = `/reports/${reportId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : ""}`;

  return (
    <Drawer open={open} onClose={onClose} title={title} description={blurb} width="md:max-w-3xl">
      <div className="mb-3 flex justify-end">
        <Link href={fullPageHref} className="text-xs font-medium text-accent-700 hover:underline">
          Open full-page report →
        </Link>
      </div>
      <CannedReportView
        result={result}
        loading={loading}
        error={error}
        filterCaption={filterCaption}
        onExport={exportAs}
        exportDisabled={loading}
      />
    </Drawer>
  );
}
