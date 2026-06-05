"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { canPreviewContentType } from "./file-type-icon";

interface Props {
  open: boolean;
  onClose: () => void;
  fileName: string;
  contentType: string;
  downloadUrl: string;
}

function previewApiUrl(downloadUrl: string): string {
  const sep = downloadUrl.includes("?") ? "&" : "?";
  return `${downloadUrl}${sep}preview=1`;
}

export function DocumentPreviewModal({
  open,
  onClose,
  fileName,
  contentType,
  downloadUrl,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      return;
    }

    if (!canPreviewContentType(contentType)) {
      setError("Preview not available for this file type");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(previewApiUrl(downloadUrl), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load preview");
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Preview failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, downloadUrl, contentType]);

  useEffect(() => {
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  return (
    <Modal open={open} onClose={onClose} title={fileName} width="max-w-4xl">
      <div className="min-h-[320px]">
        {loading && <p className="py-12 text-center text-sm text-crm-muted">Loading preview…</p>}
        {error && <p className="py-12 text-center text-sm text-red-600">{error}</p>}
        {!loading && !error && blobUrl && contentType.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blobUrl}
            alt={fileName}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded border border-crm-border"
          />
        )}
        {!loading && !error && blobUrl && contentType === "application/pdf" && (
          <iframe
            src={blobUrl}
            title={fileName}
            className="h-[70vh] w-full rounded border border-crm-border"
          />
        )}
      </div>
    </Modal>
  );
}
