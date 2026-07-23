"use client";

import { Download } from "lucide-react";
import { Tooltip } from "@quikit/ui";
import { fileIcon, isImageFile } from "@/lib/file-icon";

/**
 * One file card, shared by the description-attachments and imported-attachments
 * sections so both look identical. Renders a real image thumbnail when a preview
 * source is available, else a type-specific icon. Filename + download button
 * each carry a tooltip. Clicking the preview opens the file; the download button
 * saves it.
 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttachmentCard({
  fileName,
  size,
  mime,
  previewHref,
  imageSrc,
  downloadHref,
  uploadedAt,
}: {
  fileName: string;
  /** Human-readable size (e.g. "641 KB"); omitted if unknown. */
  size?: string;
  mime?: string | null;
  /** Where clicking the card opens the file (new tab). */
  previewHref: string;
  /** If set (and the file is an image), rendered as the thumbnail. */
  imageSrc?: string | null;
  /** Forces a download (Content-Disposition). */
  downloadHref: string;
  /** ISO upload timestamp — shown as a date/time line when present. */
  uploadedAt?: string | null;
}) {
  const showThumb = !!imageSrc && isImageFile(fileName, mime);
  const { Icon, color } = fileIcon(fileName, mime);
  const dateLabel = formatDateTime(uploadedAt);

  return (
    <div className="group relative w-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151A21] hover:border-blue-300 dark:hover:border-blue-500 overflow-hidden transition-colors">
      {/* Download button — top-right, always visible, with a "Download" tooltip.
          The <a> itself is the positioned element; the Tooltip wraps only the
          icon so it doesn't interfere with the absolute positioning or hover. */}
      <a
        href={downloadHref}
        download={fileName}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${fileName}`}
        className="absolute right-1.5 top-1.5 z-20 rounded bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 shadow-sm"
      >
        <Tooltip content="Download" contentClassName="px-2 py-1">
          <Download className="h-3.5 w-3.5" />
        </Tooltip>
      </a>

      {/* Preview panel — opens the file. Real thumbnail for images. */}
      <a href={previewHref} target="_blank" rel="noopener noreferrer" className="block">
        <div className="h-[72px] flex items-center justify-center bg-gray-100 dark:bg-[#222A35] overflow-hidden">
          {showThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageSrc!} alt={fileName} className="w-full h-full object-cover" />
          ) : (
            <Icon className={`h-7 w-7 ${color}`} />
          )}
        </div>
        <div className="p-2">
          <Tooltip content={fileName} widthClass="max-w-xs" contentClassName="px-2.5 py-1.5 break-words">
            <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">
              {fileName}
            </div>
          </Tooltip>
          {size && <div className="text-[11px] text-gray-500 mt-0.5">{size}</div>}
          {dateLabel && <div className="text-[11px] text-gray-400 mt-0.5">{dateLabel}</div>}
        </div>
      </a>
    </div>
  );
}
