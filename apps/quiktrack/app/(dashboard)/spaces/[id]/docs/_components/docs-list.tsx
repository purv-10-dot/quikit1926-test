"use client";

import { useRouter } from "next/navigation";
import { Pencil, Download } from "lucide-react";

interface DocSummary {
  id: string;
  title: string;
  templateKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reference-style list of docs: blue title link with a hover external-link
 * icon, an avatar circle, hover-only edit / share / download actions, and a
 * "Created MMM dd, yyyy" subtext underneath each row.
 */
export function DocsList({
  projectId,
  docs,
  onDownload,
}: {
  projectId: string;
  docs: DocSummary[];
  onDownload?: (doc: DocSummary) => void;
}) {
  const router = useRouter();

  function open(doc: DocSummary) {
    router.push(`/spaces/${projectId}/docs/${doc.id}`);
  }

  return (
    <div className="space-y-0">
      {docs.map((d) => (
        <div
          key={d.id}
          className="group border-b border-gray-200 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => open(d)}
                className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1.5 min-w-0"
              >
                <span className="truncate">{d.title}</span>
              </button>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => open(d)}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                aria-label="Edit"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(d);
                }}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                aria-label="Download"
              >
                <Download className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Created {fmtDate(d.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
