"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Doc {
  id: string;
  category: string;
  filename: string;
  mimeType: string;
  blobUrl: string;
  version: number;
  status: string;
  rejectReason: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface Category {
  slug: string;
  label: string;
}

const STATUS_BADGE: Record<string, string> = {
  "under-review": "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function DocumentsClient({
  dealId,
  categories,
  documents,
}: {
  dealId: string;
  categories: Category[];
  documents: Doc[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(category: string, file: File) {
    setError(null);
    setUploading(category);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dealId", dealId);
      fd.append("category", category);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? "Upload failed");
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {categories.map((cat) => {
        const catDocs = documents.filter((d) => d.category === cat.slug);
        const latest = catDocs[0];
        const isUploading = uploading === cat.slug;

        return (
          <div
            key={cat.slug}
            className="bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{cat.label}</p>
                {!latest && (
                  <p className="text-xs text-gray-400 mt-0.5">Not uploaded</p>
                )}
              </div>
              {latest && (
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border",
                    STATUS_BADGE[latest.status] ?? "bg-gray-100 text-gray-600 border-gray-200",
                  )}
                >
                  {latest.status === "under-review"
                    ? "Under review"
                    : latest.status === "accepted"
                      ? "Accepted"
                      : latest.status === "rejected"
                        ? "Rejected"
                        : latest.status}
                </span>
              )}
            </div>

            {latest && (
              <div className="text-xs text-gray-600 mb-2">
                <a
                  href={latest.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {latest.filename}
                </a>
                <span className="text-gray-400 ml-2">
                  · v{latest.version} · {(latest.sizeBytes / 1024).toFixed(0)} KB
                </span>
                {latest.status === "rejected" && latest.rejectReason && (
                  <p className="mt-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                    Rejected: {latest.rejectReason}
                  </p>
                )}
              </div>
            )}

            <label
              className={cn(
                "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg cursor-pointer border",
                isUploading
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-wait"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
              )}
            >
              <input
                type="file"
                className="sr-only"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(cat.slug, file);
                  e.target.value = "";
                }}
              />
              {isUploading ? "Uploading…" : latest ? "Re-upload" : "Upload"}
            </label>
          </div>
        );
      })}
    </div>
  );
}
