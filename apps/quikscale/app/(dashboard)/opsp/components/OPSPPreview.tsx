"use client";

/**
 * OPSP Preview modal — Architecture B: react-pdf single source of truth.
 *
 * The modal embeds <PDFViewer> showing OPSPDocument. The "Download PDF" button
 * generates the same artifact via pdf().toBlob(). Preview = PDF guaranteed.
 *
 * Chrome layout — single compact 52px slate-800 toolbar with three zones:
 *   • left:   document title (icon + "OPSP — {year} {quarter}")
 *   • center: zoom controls ([−] [100%] [+])
 *   • right:  primary download + close
 *
 * Zoom is implemented via CSS `transform: scale()` on the iframe wrapper —
 * snappy and instant. PDF inside scales as a bitmap (slight blur at high
 * zoom is acceptable for preview; the download is always pixel-perfect).
 */

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Loader2, Download, FileText, X, Plus, Minus } from "lucide-react";
import type { FormData } from "../hooks/useOPSPForm";
import { OPSPDocument } from "./OPSPDocument";

// PDFViewer is heavy (PDF.js + iframe) — load it client-side only.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PDFLoading /> },
);

function PDFLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-100 text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      <span>Rendering PDF preview…</span>
    </div>
  );
}

/** Discrete zoom levels (50% → 200% in 25% steps). Click the % indicator to
 * reset to 100%. Min/max enforced via button disabled states. */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200] as const;
const ZOOM_MIN = ZOOM_STEPS[0];
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Base page render dimensions — A4 portrait aspect ratio (210:297 ≈ 1:1.41).
 * The PDFViewer iframe always renders at this fixed pixel size; zoom is
 * applied as a CSS transform on a wrapper. Higher base = sharper at 100%
 * zoom but larger initial render cost. 800×1130 is a good middle ground. */
const PAGE_W = 800;
const PAGE_H = 1130;

export function OPSPPreview({
  open,
  onClose,
  form,
  users = [],
}: {
  open: boolean;
  onClose: () => void;
  form: FormData;
  users?: { id: string; firstName: string; lastName: string }[];
}) {
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState<number>(100);

  /* ── Download PDF ── single render path: react-pdf .toBlob() ── */
  const handleDownloadPDF = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<OPSPDocument form={form} users={users} />).toBlob();
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
  }, [downloading, form, users]);

  /* ── Zoom controls ── walk discrete steps, clamp to bounds ── */
  const zoomIn = useCallback(() => {
    setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? z);
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z);
  }, []);
  const resetZoom = useCallback(() => setZoom(100), []);

  if (!open) return null;

  const canZoomOut = zoom > ZOOM_MIN;
  const canZoomIn = zoom < ZOOM_MAX;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/70">
      {/* ── Toolbar (52px slate-800) ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-13 bg-slate-800 text-white shrink-0 shadow-lg border-b border-slate-700"
        style={{ height: 52 }}
      >
        {/* Left zone — document title */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-wide truncate">
            OPSP — {form.year} {form.quarter}
          </span>
        </div>

        {/* Center zone — zoom controls */}
        <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-0.5">
          <button
            onClick={zoomOut}
            disabled={!canZoomOut}
            title="Zoom out"
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={resetZoom}
            title="Reset to 100%"
            className="px-3 py-1 text-xs font-medium tabular-nums hover:bg-white/10 rounded-md transition-colors min-w-[58px] text-center"
          >
            {zoom}%
          </button>
          <button
            onClick={zoomIn}
            disabled={!canZoomIn}
            title="Zoom in"
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Right zone — download + close */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
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

      {/* ── Document area — gray bg, centered, zoom-scrollable ──────────
          Layout strategy:
            - Outer flex container scrolls in both directions when needed.
            - Centered scaled wrapper takes the *visual* (scaled) dimensions
              so scrollbars appear naturally when zoomed > 100%.
            - Inner wrapper renders PDFViewer at fixed PAGE_W × PAGE_H and
              CSS-scales — explicit pixel dims on the iframe avoid the
              "100% of transformed parent" sizing bug. */}
      <div className="flex-1 overflow-auto bg-slate-300 flex justify-center items-start p-6">
        <div
          style={{
            width: (PAGE_W * zoom) / 100,
            height: (PAGE_H * zoom) / 100,
            flexShrink: 0,
            transition: "width 150ms ease-out, height 150ms ease-out",
          }}
        >
          <div
            style={{
              width: PAGE_W,
              height: PAGE_H,
              transformOrigin: "top left",
              transform: `scale(${zoom / 100})`,
              transition: "transform 150ms ease-out",
              backgroundColor: "white",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}
          >
            <PDFViewer
              width={PAGE_W}
              height={PAGE_H}
              showToolbar={false}
              style={{ border: 0 }}
            >
              <OPSPDocument form={form} users={users} />
            </PDFViewer>
          </div>
        </div>
      </div>
    </div>
  );
}
