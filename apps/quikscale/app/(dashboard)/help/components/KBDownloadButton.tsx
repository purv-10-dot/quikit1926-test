"use client";

/**
 * "Download PDF" for the Knowledge Base.
 *
 * Before generating, probes every figure slot with a HEAD request and passes
 * only the files that actually resolved to the document. react-pdf throws on a
 * missing <Image> src, so the probe is not an optimisation — it is what lets the
 * manual ship with some screenshots captured and others still outstanding.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { KB_CHAPTERS, KB_GROUPS, KB_META, collectFigures } from "@/lib/knowledge-base";

async function probeScreens(files: string[]): Promise<string[]> {
  const results = await Promise.all(
    files.map(async (f) => {
      try {
        const res = await fetch(`/kb/screens/${f}`, { method: "HEAD", cache: "force-cache" });
        // A Next.js dev server answers 404 for a missing public file; some hosts
        // answer 200 with an HTML error page, so check the content type too.
        const type = res.headers.get("content-type") ?? "";
        return res.ok && type.startsWith("image/") ? f : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((f): f is string => f !== null);
}

export function KBDownloadButton({ orgName }: { orgName: string }) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const figures = collectFigures(KB_CHAPTERS);
      const unique = Array.from(new Set(figures.map((f) => f.file)));
      const availableScreens = await probeScreens(unique);

      const [{ pdf }, { default: KBPdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./KBPdfDoc"),
      ]);

      const generatedOn = new Date().toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      });

      const blob = await pdf(
        <KBPdfDoc
          chapters={KB_CHAPTERS}
          groups={KB_GROUPS}
          meta={KB_META}
          orgName={orgName || "QuikScale"}
          generatedOn={generatedOn}
          availableScreens={availableScreens}
          // Absolute — react-pdf fetches the image itself and has no document
          // base to resolve a root-relative path against.
          screenBase={`${window.location.origin}/kb/screens`}
        />,
      ).toBlob();

      if (!blob || blob.size === 0) throw new Error("Generated PDF is empty");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "QuikScale-Knowledge-Base.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error("[knowledge-base] PDF generation failed", err);
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
      className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {busy ? "Building manual…" : "Download PDF"}
    </button>
  );
}
