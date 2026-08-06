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

interface ScreenInfo { file: string; w: number; h: number }

/**
 * Load every figure slot and report which ones exist, with their pixel size.
 *
 * The size matters as much as the existence: react-pdf gives an <Image> no
 * intrinsic dimensions, so without a real width/height the document has to fall
 * back to full column width — which upscales a narrow crop (a 219px sidebar
 * strip) roughly 5× into a blurry smear. Decoding the image is the only way to
 * learn its true size on the client.
 */
async function probeScreens(files: string[]): Promise<ScreenInfo[]> {
  const results = await Promise.all(
    files.map(
      (file) =>
        new Promise<ScreenInfo | null>((resolve) => {
          const img = new window.Image();
          img.onload = () =>
            resolve({ file, w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = `/kb/screens/${file}`;
        }),
    ),
  );
  return results.filter((r): r is ScreenInfo => r !== null && r.w > 0 && r.h > 0);
}

export function KBDownloadButton({ orgName }: { orgName: string }) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const figures = collectFigures(KB_CHAPTERS);
      const unique = Array.from(new Set(figures.map((f) => f.file)));
      const found = await probeScreens(unique);
      const availableScreens = found.map((f) => f.file);
      const screenSizes = Object.fromEntries(found.map((f) => [f.file, { w: f.w, h: f.h }]));

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
          screenSizes={screenSizes}
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
