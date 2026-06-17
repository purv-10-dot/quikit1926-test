"use client";

import { useRouter } from "next/navigation";
import { Pencil, Download, FileText, Trash2 } from "lucide-react";
import { Avatar } from "@quikit/ui";
import type { DocSummary } from "./use-docs";

/** MIME type for native HTML5 drag of a doc row (distinct from the board's
 *  issue drag so the two can never be cross-dropped). */
export const DOC_DRAG_TYPE = "application/quiktrack-doc";

/** Shared grid template so the header and every row align into columns:
 *  Title (flex) · Owner · Created · Last updated · Actions. Owner/date/actions
 *  columns collapse away below `md` so the title stays usable on narrow
 *  screens. The trailing column reserves room for the hover actions so they
 *  never cover the dates. */
const GRID =
  "grid grid-cols-[1fr] md:grid-cols-[1fr_180px_110px_110px_72px] gap-3 items-center";

/** Column header row, rendered once at the top of each section. */
export function DocsTableHeader() {
  return (
    <div
      className={`${GRID} px-3 py-2 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-400`}
    >
      <span>Title</span>
      <span className="hidden md:block">Owner</span>
      <span className="hidden md:block">Created</span>
      <span className="hidden md:block">Last updated</span>
      <span className="hidden md:block" aria-hidden />
    </div>
  );
}

/**
 * A single draggable doc row in the table. Dragging it onto a folder (or the
 * root zone) moves the doc. Hover reveals edit/download actions over the row.
 */
export function DocRow({
  projectId,
  doc,
  onDownload,
  onDragStart,
  canDelete,
  onDelete,
}: {
  projectId: string;
  doc: DocSummary;
  onDownload?: (doc: DocSummary) => void;
  onDragStart?: (doc: DocSummary) => void;
  /** When true, show a delete action (gated by Doc:delete). */
  canDelete?: boolean;
  onDelete?: (doc: DocSummary) => void;
}) {
  const router = useRouter();
  const ownerName =
    [doc.ownerFirstName, doc.ownerLastName].filter(Boolean).join(" ").trim() || null;

  function open() {
    router.push(`/spaces/${projectId}/docs/${doc.id}`);
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
        onDragStart?.(doc);
      }}
      className={`group ${GRID} px-3 py-2.5 border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing`}
    >
      {/* Title */}
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
        <button
          type="button"
          onClick={open}
          className="text-sm font-medium text-blue-600 hover:underline truncate text-left"
        >
          {doc.title}
        </button>
      </div>

      {/* Owner */}
      <div className="hidden md:flex items-center gap-2 min-w-0">
        {ownerName ? (
          <>
            <Avatar
              src={doc.ownerAvatar}
              firstName={doc.ownerFirstName ?? ""}
              lastName={doc.ownerLastName ?? ""}
              size="sm"
            />
            <span className="text-sm text-gray-700 truncate">{ownerName}</span>
          </>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </div>

      {/* Created */}
      <span className="hidden md:block text-sm text-gray-500">{fmtDate(doc.createdAt)}</span>

      {/* Last updated */}
      <span className="hidden md:block text-sm text-gray-500">{fmtDate(doc.updatedAt)}</span>

      {/* Actions — own column so they never cover the dates; revealed on row hover */}
      <div className="hidden md:flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={open}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors"
          aria-label="Edit"
        >
          <Pencil className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.(doc);
          }}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors"
          aria-label="Download"
        >
          <Download className="w-3.5 h-3.5 text-gray-600" />
        </button>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc);
            }}
            className="p-1.5 rounded hover:bg-red-100 transition-colors"
            aria-label="Delete page"
            title="Delete page"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        )}
      </div>
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
