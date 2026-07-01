"use client";

/**
 * OPSP Preview modal — Architecture B: react-pdf single source of truth.
 *
 * The modal embeds <PDFViewer> showing OPSPDocument. The "Download PDF" button
 * generates the same artifact via pdf().toBlob(). Preview = PDF guaranteed.
 *
 * Chrome layout — single compact 52px slate-800 toolbar with two zones:
 *   • left:  document title (icon + "OPSP — {year} {quarter}")
 *   • right: primary download + close
 *
 * No zoom — CSS transform was blurring text. Users who need zoom can use the
 * browser's native PDF viewer in the iframe (Cmd+/− works in PDF.js).
 */

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Loader2, Download, FileText, X } from "lucide-react";
import type { FormData } from "../hooks/useOPSPForm";
import { OPSPDocument } from "./OPSPDocument";
import { redactOpspPerUserSections } from "../lib/pdfRedact";

// PDFViewer is heavy (PDF.js + iframe) — load it client-side only.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PDFLoading /> },
);

function PDFLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-300 text-slate-600">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      <span>Rendering PDF preview…</span>
    </div>
  );
}

export function OPSPPreview({
  open,
  onClose,
  form,
  users = [],
  tenantName = "",
  currentUserName = "",
}: {
  open: boolean;
  onClose: () => void;
  form: FormData;
  users?: { id: string; firstName: string; lastName: string }[];
  /** Rendered in Page 1 blue band "Organization:" field. */
  tenantName?: string;
  /** Rendered in Page 2 blue band "Your Name:" field. */
  currentUserName?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  // Download-confirm modal: asks whether to include the four per-user sections
  // (Your Accountability / Quarterly Priorities / Critical # / Balanced
  // Critical #). Default OFF — the user opts IN to include personal data.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [includeSections, setIncludeSections] = useState(false);

  /* ── Download PDF ── single render path: react-pdf .toBlob() ──
     `includeSections=false` empties the four per-user sections so they print
     blank; everything else is unchanged. */
  const handleDownloadPDF = useCallback(async (include: boolean) => {
    if (downloading) return;
    setConfirmOpen(false);
    setDownloading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const docForm = include ? form : redactOpspPerUserSections(form);
      const blob = await pdf(<OPSPDocument form={docForm} users={users} tenantName={tenantName} currentUserName={currentUserName} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OPSP_${form.year}_${form.quarter}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      alert("PDF download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, form, users, tenantName, currentUserName]);

  // Open the confirm modal (reset the checkbox to its default each time).
  const openDownloadConfirm = useCallback(() => {
    setIncludeSections(false);
    setConfirmOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/70">
      {/* ── Toolbar (52px slate-800) — title left, actions right ────────── */}
      <div
        className="flex items-center justify-between px-5 bg-slate-800 text-white shrink-0 shadow-lg border-b border-slate-700"
        style={{ height: 52 }}
      >
        {/* Left: document title */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-wide truncate">
            OPSP — {form.year} {form.quarter}
          </span>
        </div>

        {/* Right: download + close */}
        <div className="flex items-center gap-2">
          <button
            onClick={openDownloadConfirm}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloading ? "Generating…" : "Download PDF"}
          </button>
          <div className="w-px h-6 bg-white/15" />
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Close (Esc)"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Document area — PDFViewer fills the full remaining space ──── */}
      <div className="flex-1 bg-slate-300">
        <PDFViewer
          width="100%"
          height="100%"
          showToolbar={false}
          style={{ border: 0 }}
        >
          <OPSPDocument form={form} users={users} tenantName={tenantName} currentUserName={currentUserName} />
        </PDFViewer>
      </div>

      {/* ── Download confirm: include the per-user sections? ── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="px-5 pt-5">
              <h2 className="text-sm font-semibold text-gray-900">Include personal section data?</h2>
              <p className="mt-1 text-xs text-gray-500">
                Do you want to include this OPSP&apos;s <span className="font-semibold">Your Accountability</span>,{" "}
                <span className="font-semibold">Quarterly Priorities</span>,{" "}
                <span className="font-semibold">Critical Number</span> &amp;{" "}
                <span className="font-semibold">Balanced Critical Number</span> in the downloaded PDF?
                Leave it unchecked to download with those sections blank.
              </p>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={includeSections}
                  onChange={(e) => setIncludeSections(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 flex-shrink-0"
                />
                <span>
                  Include Your Accountability, Quarterly Priorities, Critical Number &amp; Balanced
                  Critical Number data
                </span>
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPDF(includeSections)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
