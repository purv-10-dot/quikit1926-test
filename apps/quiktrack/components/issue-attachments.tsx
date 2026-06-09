"use client";

import { useEffect, useState } from "react";
import { Paperclip, Download, FileText, ImageIcon } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";

interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceSystem: string | null;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

/**
 * Read-only attachments list for an issue. The Jira importer is the only
 * writer for now — uploads from QuikTrack are tracked as a follow-up.
 * Thumbnails for images are fetched lazily via a presigned GET so we don't
 * load every file when the panel opens.
 */
export function IssueAttachments({ issueId }: { issueId: string }) {
  // Shared cached read — dedupes the dev StrictMode double-fetch and is reused
  // if another view requests the same issue's attachments.
  const { data: rows = null } = useApiData<AttachmentRow[]>(
    ["quiktrack", "issue-attachments", issueId],
    `/api/issues/${issueId}/attachments`,
  );
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Lazy thumbnail fetch — one presigned URL per image attachment.
  useEffect(() => {
    if (!rows) return;
    const images = rows.filter((r) => isImage(r.mimeType) && !thumbs[r.id]);
    if (images.length === 0) return;
    let cancelled = false;
    void Promise.all(
      images.map(async (r) => {
        try {
          const j = await fetch(
            `/api/issues/${issueId}/attachments/${r.id}`,
          ).then((res) => res.json());
          if (j?.success && j.data?.url) return [r.id, j.data.url] as const;
        } catch {}
        return null;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const p of pairs) if (p) next[p[0]] = p[1];
      if (Object.keys(next).length > 0) setThumbs((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [rows, issueId, thumbs]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-gray-500" />
        Attachments
        <span className="text-gray-500 font-normal">({rows.length})</span>
      </h3>
      <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {rows.map((r) => {
          const previewHref = `/api/issues/${issueId}/attachments/${r.id}?redirect=1`;
          const downloadHref = `/api/issues/${issueId}/attachments/${r.id}?download=1`;
          const img = isImage(r.mimeType) ? thumbs[r.id] : null;
          return (
            <li
              key={r.id}
              className="group border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
            >
              {/* Clicking the preview area opens the file in a new tab. */}
              <a
                href={previewHref}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <div className="aspect-video bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                  {img ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={img}
                      alt={r.fileName}
                      className="object-cover w-full h-full"
                    />
                  ) : isImage(r.mimeType) ? (
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  ) : (
                    <FileText className="w-8 h-8 text-gray-400" />
                  )}
                </div>
              </a>
              <div className="p-2 text-[12px]">
                <div
                  className="font-medium text-gray-900 dark:text-gray-100 truncate"
                  title={r.fileName}
                >
                  {r.fileName}
                </div>
                <div className="flex items-center justify-between text-gray-500 mt-0.5">
                  <span>{formatBytes(r.sizeBytes)}</span>
                  {/* `download` attribute + Content-Disposition on the
                      presigned URL means the browser saves the file instead
                      of opening it. */}
                  <a
                    href={downloadHref}
                    download={r.fileName}
                    className="p-1 -m-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
