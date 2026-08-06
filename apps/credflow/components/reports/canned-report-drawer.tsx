"use client";

import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { CannedReportView } from "./canned-report-view";
import { useCannedReport } from "./use-canned-report";

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
  canExport?: boolean;
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
  canExport,
}: DrawerProps) {
  const { result, loading, error } = useCannedReport({
    reportId,
    from,
    to,
    ownerId,
    enabled: open,
  });

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
        canExport={canExport}
      />
    </Drawer>
  );
}
