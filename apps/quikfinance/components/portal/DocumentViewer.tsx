"use client";

import { X, Download, FileText } from "lucide-react";

export type ViewerDoc = { fileName: string; contentType: string | null; src: string };

/**
 * Shared document viewer — renders a PDF or image inline from a data URI / URL,
 * with a download fallback for other types. Used across portals (audit working
 * papers, shared documents, attachments).
 */
export function DocumentViewer({ doc, onClose }: { doc: ViewerDoc; onClose: () => void }) {
  const type = doc.contentType ?? "";
  const isPdf = type.includes("pdf") || doc.fileName.toLowerCase().endsWith(".pdf");
  const isImage = type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(doc.fileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="flex items-center gap-2 truncate text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />{doc.fileName}</span>
          <div className="flex items-center gap-1">
            <a href={doc.src} download={doc.fileName} className="rounded-lg p-2 hover:bg-muted" aria-label="Download"><Download className="h-4 w-4" /></a>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-muted/30">
          {isPdf ? (
            <iframe title={doc.fileName} src={doc.src} className="h-full w-full" />
          ) : isImage ? (
            <div className="flex h-full items-center justify-center p-4"><img src={doc.src} alt={doc.fileName} className="max-h-full max-w-full rounded-lg shadow" /></div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 opacity-50" />
              <p>Preview isn't available for this file type.</p>
              <a href={doc.src} download={doc.fileName} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"><Download className="h-4 w-4" />Download</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
