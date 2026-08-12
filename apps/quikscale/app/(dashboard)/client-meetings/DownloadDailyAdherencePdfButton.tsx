"use client";

/**
 * "Download PDF" for a DAILY Adherence Report — client-side react-pdf build,
 * same lazy-import + blob-download pattern as `KBDownloadButton.tsx`.
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

export function DownloadDailyAdherencePdfButton({ report }: { report: StoredMeetingReport }) {
  const { org } = useOrgInfo();
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const [{ pdf }, { default: DailyAdherencePdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./DailyAdherencePdfDoc"),
      ]);

      const blob = await pdf(
        <DailyAdherencePdfDoc report={report} orgName={org?.name ?? "QuikScale"} />,
      ).toBlob();

      if (!blob || blob.size === 0) throw new Error("Generated PDF is empty");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateSlug = report.meetingDetails?.dateLabel || report.meta?.date || "report";
      a.download = `Daily-Huddle-Adherence-${dateSlug}.pdf`.replace(/[^\w.-]+/g, "-");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error("[meeting-report] PDF generation failed", err);
      // eslint-disable-next-line no-alert
      alert("Could not generate the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-accent-300 px-3 py-1.5 text-xs font-medium text-accent-700 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {busy ? "Building…" : "Download PDF"}
    </button>
  );
}
