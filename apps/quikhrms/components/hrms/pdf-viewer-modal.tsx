"use client";

import { useEffect, useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";

interface PdfViewerModalProps {
  open: boolean;
  /** API url that returns the PDF (fetched WITH auth, shown inline). */
  url: string | null;
  title?: string;
  /** Suggested filename for the Download button. */
  fileName?: string;
  onClose: () => void;
}

/**
 * In-app PDF viewer. Fetches the file (with auth headers) into a blob and shows
 * it in an iframe inside a modal — so the user never leaves HRMS (avoids the
 * pop-up-blocked → tab-replaced-by-blob-URL trap). Has Close + Download.
 */
export function PdfViewerModal({ open, url, title, fileName, onClose }: PdfViewerModalProps) {
  const api = useApiClient();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !url) return;
    let objUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    api.blobUrl(url)
      .then((u) => {
        if (cancelled) { URL.revokeObjectURL(u); return; }
        objUrl = u;
        setBlobUrl(u);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the file."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [open, url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title ?? "Document"}</h3>
          <div className="flex items-center gap-1.5">
            {blobUrl && (
              <a
                href={blobUrl}
                download={fileName ?? "document.pdf"}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                <Download size={13} /> Download
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 grid place-items-center text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-500 text-xs">
              <Loader2 className="animate-spin" size={22} /> Loading…
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center px-6 text-center text-xs text-red-600">{error}</div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title={title ?? "Document"} className="w-full h-full border-0" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
