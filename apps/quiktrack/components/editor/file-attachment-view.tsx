"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { fileIcon, isImageFile } from "@/lib/file-icon";

function humanSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * In-editor display of a file attachment — a card matching the read-only
 * AttachmentCard (colored per-type icon + filename + size). Display-only: no
 * download/preview links inside the editor (those belong to read-only views).
 * Rendered via ReactNodeViewRenderer; the node's parseHTML/renderHTML are
 * unchanged, so content still loads and serializes to `<a data-file-*>`.
 */
export function FileAttachmentView({ node }: NodeViewProps) {
  const fileName = String(node.attrs.fileName ?? "file");
  const mime = (node.attrs.mimeType as string | null) ?? null;
  const size = typeof node.attrs.size === "number" ? (node.attrs.size as number) : null;
  const href = String(node.attrs.href ?? "");
  const { Icon, color } = fileIcon(fileName, mime);
  const showThumb = isImageFile(fileName, mime) && !!href;

  return (
    <NodeViewWrapper
      as="span"
      className="qt-file-nodeview"
      contentEditable={false}
      title={fileName}
    >
      <span className="inline-flex flex-col align-top w-40 mr-1.5 my-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151A21] overflow-hidden select-none">
        <span className="h-14 flex items-center justify-center bg-gray-100 dark:bg-[#222A35] overflow-hidden">
          {showThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={href} alt={fileName} className="w-full h-full object-cover" />
          ) : (
            <Icon className={`h-7 w-7 ${color}`} />
          )}
        </span>
        <span className="px-2 pt-1.5">
          <span className="block text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">
            {fileName}
          </span>
          {humanSize(size) && (
            <span className="block text-[11px] text-gray-500 pb-1.5">{humanSize(size)}</span>
          )}
        </span>
      </span>
    </NodeViewWrapper>
  );
}
