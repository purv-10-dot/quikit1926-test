"use client";

import type { ReactNode } from "react";
import { Download } from "lucide-react";
import {
  LEADS_IMPORT_SAMPLE_CSV,
  LEADS_IMPORT_SAMPLE_FILENAME,
} from "@/lib/import/leads-import-sample";
import { downloadCsvFile } from "@/lib/utils/download-csv";

export function downloadLeadsImportSample(): void {
  downloadCsvFile(LEADS_IMPORT_SAMPLE_CSV, LEADS_IMPORT_SAMPLE_FILENAME);
}

type LeadsImportSampleDownloadProps = {
  className?: string;
  children?: ReactNode;
};

export function LeadsImportSampleDownload({
  className = "inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:text-accent-800 hover:underline",
  children = "Download example CSV",
}: LeadsImportSampleDownloadProps) {
  return (
    <button type="button" onClick={downloadLeadsImportSample} className={className}>
      <Download size={16} aria-hidden />
      {children}
    </button>
  );
}
