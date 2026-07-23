"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { AttachmentCard } from "@/components/attachment-card";

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
      <ul className="flex flex-wrap gap-3">
        {rows.map((r) => {
          const previewHref = `/api/issues/${issueId}/attachments/${r.id}?redirect=1`;
          const downloadHref = `/api/issues/${issueId}/attachments/${r.id}?download=1`;
          const img = isImage(r.mimeType) ? thumbs[r.id] : null;
          return (
            <li key={r.id}>
              <AttachmentCard
                fileName={r.fileName}
                size={formatBytes(r.sizeBytes)}
                mime={r.mimeType}
                previewHref={previewHref}
                imageSrc={img}
                downloadHref={downloadHref}
                uploadedAt={r.createdAt}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
