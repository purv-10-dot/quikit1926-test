"use client";

/**
 * Download the Daily Huddle Weekly Report as .docx or .pdf.
 *
 * The two formats take deliberately different routes:
 *   - .docx is built SERVER-side from the stored report, so the facilitator
 *     gets an editable Word deliverable and the file can only ever contain
 *     what was actually generated and validated.
 *   - .pdf is built CLIENT-side with react-pdf (lazy-imported so its weight
 *     never lands in the page bundle), matching the daily adherence report.
 */
import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** `Daily-Huddle-Weekly-Quikit-2026-08-10` */
const baseName = (report: StoredWeeklyReport) =>
  `Daily-Huddle-Weekly-${report.clientName}-${report.weekStart}`.replace(/[^\w.-]+/g, "-").slice(0, 80);

export function DownloadWeeklyReportButtons({
  report,
  clientId,
  weekStart,
}: {
  report: StoredWeeklyReport;
  clientId: string;
  weekStart: string;
}) {
  const { org } = useOrgInfo();
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadDocx() {
    setBusy("docx");
    setError(null);
    try {
      const res = await fetch("/api/client-meetings/reports/weekly/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, weekStart }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Export failed (${res.status})`);
      }
      triggerDownload(await res.blob(), `${baseName(report)}.docx`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    setBusy("pdf");
    setError(null);
    try {
      const [{ pdf }, { default: WeeklyReportPdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./WeeklyReportPdfDoc"),
      ]);
      const blob = await pdf(
        <WeeklyReportPdfDoc report={report} orgName={org?.name ?? "QuikScale"} />,
      ).toBlob();
      if (!blob || blob.size === 0) throw new Error("Generated PDF is empty");
      triggerDownload(blob, `${baseName(report)}.pdf`);
    } catch (e) {
      console.error("[weekly-report] PDF generation failed", e);
      setError("Could not generate the PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={downloadDocx}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {busy === "docx" ? "Building…" : "Download .docx"}
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {busy === "pdf" ? "Building…" : ".pdf"}
        </button>
      </div>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
