"use client";

/**
 * Scaling Up SWT Worksheet preview + PDF export.
 *
 * Renders the actual PDF inline with @react-pdf/renderer's <PDFViewer> — what
 * you see in the modal is literally what downloads. The "Export PDF" button
 * uses the same Document via the `pdf()` programmatic API.
 *
 * No html2canvas, no bitmap capture, no halos — real PDF text rendering.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { X, Download, Loader2 } from "lucide-react";
import SWTPdfDoc, { type SWTEntry } from "./SWTPdfDoc";

// PDFViewer must be client-only — it injects an iframe and uses browser APIs.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <div className="text-xs text-gray-400 text-center py-16">Preparing preview…</div> },
);

export default function SWTPreview({
  entries,
  quarter,
  year,
  onClose,
}: {
  entries: SWTEntry[];
  quarter: string;
  year: number;
  onClose: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/info");
        const json = await res.json();
        if (!cancelled && json?.success && json.data?.name) setOrgName(json.data.name);
      } catch { /* keep generic */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(
        <SWTPdfDoc entries={entries} quarter={quarter} year={year} orgName={orgName} />
      ).toBlob();
      if (!blob || blob.size === 0) {
        throw new Error("Generated PDF blob is empty");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SWT-Worksheet-${quarter}-${year}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so the browser has time to initiate the download —
      // revoking too early can produce an empty file in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">SWT Worksheet — Preview</h2>
          <span className="text-[11px] text-gray-400">
            {quarter} {year} · {entries.length} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || entries.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? "Generating PDF…" : "Export PDF"}
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Inline PDF preview — identical to what the Export button downloads */}
      <div className="flex-1 bg-gray-200 min-h-0">
        <PDFViewer width="100%" height="100%" style={{ border: 0 }} showToolbar={false}>
          <SWTPdfDoc entries={entries} quarter={quarter} year={year} orgName={orgName} />
        </PDFViewer>
      </div>
    </div>
  );
}
