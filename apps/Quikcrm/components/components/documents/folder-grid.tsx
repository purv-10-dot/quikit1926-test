"use client";

import { Folder, Download, Eye, Trash2, MoreVertical } from "lucide-react";
import type { DocumentDto } from "@/lib/services/documents/types";
import type { FolderDto } from "@/lib/services/document-folders/types";
import {
  canPreviewContentType,
  FileTypeIcon,
  formatFileSize,
} from "@/components/documents/file-type-icon";

export type GridItem =
  | { kind: "folder"; folder: FolderDto }
  | { kind: "file"; file: DocumentDto };

interface Props {
  folders: FolderDto[];
  files: DocumentDto[];
  view: "grid" | "table";
  readOnly?: boolean;
  onOpenFolder: (id: string) => void;
  onPreviewFile: (file: DocumentDto) => void;
  onDeleteFile?: (file: DocumentDto) => void;
  onFolderAction?: (folder: FolderDto, action: "rename" | "delete") => void;
  dragHandleProps?: (item: GridItem) => Record<string, unknown>;
}

export function FolderGrid({
  folders,
  files,
  view,
  readOnly,
  onOpenFolder,
  onPreviewFile,
  onDeleteFile,
  onFolderAction,
  dragHandleProps,
}: Props) {
  if (view === "table") {
    return (
      <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-crm-border bg-accent-50 text-left text-xs font-semibold uppercase text-crm-muted">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Size</th>
              <th className="w-24 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr
                key={f.id}
                className="cursor-pointer border-b border-crm-border/60 hover:bg-[var(--color-bg-secondary)]"
                onClick={() => onOpenFolder(f.id)}
                {...(dragHandleProps?.({ kind: "folder", folder: f }) ?? {})}
              >
                <td className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Folder size={16} className="text-accent-600" />
                    {f.name}
                  </span>
                </td>
                <td className="px-4 py-2 text-crm-muted">Folder</td>
                <td className="px-4 py-2 text-crm-muted">—</td>
                <td className="px-4 py-2">
                  {!readOnly && onFolderAction && (
                    <button
                      type="button"
                      className="rounded p-1 text-crm-muted hover:text-accent-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFolderAction(f, "rename");
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {files.map((d) => (
              <tr
                key={d.id}
                className="border-b border-crm-border/60 hover:bg-[var(--color-bg-secondary)]"
                {...(dragHandleProps?.({ kind: "file", file: d }) ?? {})}
              >
                <td className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <FileTypeIcon contentType={d.contentType} className="h-4 w-4 text-accent-600" />
                    {d.fileName}
                    {d.isLink && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        Linked
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2 text-crm-muted">{d.contentType}</td>
                <td className="px-4 py-2 tabular-nums">{formatFileSize(d.size)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {canPreviewContentType(d.contentType) && (
                      <button
                        type="button"
                        className="rounded p-1 text-crm-muted hover:text-accent-700"
                        onClick={() => onPreviewFile(d)}
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-crm-muted hover:text-accent-700"
                    >
                      <Download size={14} />
                    </a>
                    {!readOnly && onDeleteFile && (
                      <button
                        type="button"
                        className="rounded p-1 text-crm-muted hover:text-red-600"
                        onClick={() => onDeleteFile(d)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {folders.length === 0 && files.length === 0 && (
          <p className="py-10 text-center text-sm text-crm-muted">This folder is empty</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className="flex flex-col items-center gap-2 rounded-lg border border-crm-border bg-white p-4 text-center hover:border-accent-300 hover:bg-accent-50/40"
          onClick={() => onOpenFolder(f.id)}
          {...(dragHandleProps?.({ kind: "folder", folder: f }) ?? {})}
        >
          <Folder size={32} className="text-accent-600" />
          <span className="line-clamp-2 text-sm font-medium text-crm-text">{f.name}</span>
        </button>
      ))}
      {files.map((d) => (
        <div
          key={d.id}
          className="flex flex-col rounded-lg border border-crm-border bg-white p-3"
          {...(dragHandleProps?.({ kind: "file", file: d }) ?? {})}
        >
          <FileTypeIcon contentType={d.contentType} className="mb-2 h-8 w-8 text-accent-600" />
          <p className="line-clamp-2 flex-1 text-sm font-medium">
            {d.fileName}
            {d.isLink && (
              <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700">
                Linked
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-crm-muted">{formatFileSize(d.size)}</p>
          <div className="mt-2 flex gap-1">
            {canPreviewContentType(d.contentType) && (
              <button
                type="button"
                className="rounded p-1 text-crm-muted hover:text-accent-700"
                onClick={() => onPreviewFile(d)}
              >
                <Eye size={14} />
              </button>
            )}
            <a
              href={d.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-crm-muted hover:text-accent-700"
            >
              <Download size={14} />
            </a>
          </div>
        </div>
      ))}
      {folders.length === 0 && files.length === 0 && (
        <p className="col-span-full py-10 text-center text-sm text-crm-muted">This folder is empty</p>
      )}
    </div>
  );
}
