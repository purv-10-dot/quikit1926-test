"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { DOC_DRAG_TYPE, DocsTableHeader } from "./docs-list";
import { PaginatedDocList } from "./docs-paginated-list";
import { TemplateMenu } from "./template-menu";
import { useDocList, type DocSummary, type FolderSummary } from "./use-docs";

/**
 * Collapsible folder section. Its docs are loaded lazily via its own infinite
 * query (enabled only once expanded) and paginated by `PaginatedDocList`, so a
 * folder with many pages never bulk-loads. The whole section is a native drop
 * target; the "+" opens a template picker to create a page directly inside.
 */
export function DocsFolderRow({
  projectId,
  folder,
  busy,
  onCreateDoc,
  onRename,
  onDelete,
  onDownload,
  onDropDoc,
  onDragStartDoc,
  canCreateDoc = true,
  canDeleteDoc,
  onDeleteDoc,
}: {
  projectId: string;
  folder: FolderSummary;
  busy?: boolean;
  onCreateDoc: (folderId: string, templateKey: string) => void;
  onRename: (folderId: string, name: string) => void;
  onDelete: (folder: FolderSummary) => void;
  onDownload?: (doc: DocSummary) => void;
  onDropDoc: (docId: string, toScope: string) => void;
  onDragStartDoc?: (doc: DocSummary) => void;
  /** Hide the in-folder "new doc" (+) action when the role lacks Doc:create. */
  canCreateDoc?: boolean;
  /** Show per-doc delete in the folder's list (gated by Doc:delete). */
  canDeleteDoc?: boolean;
  onDeleteDoc?: (doc: DocSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const list = useDocList(projectId, folder.id, open);
  const docs = list.data?.pages.flatMap((p) => p.data) ?? [];

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: React.DragEvent) {
    const docId = e.dataTransfer.getData(DOC_DRAG_TYPE);
    setDragOver(false);
    if (!docId) return;
    e.preventDefault();
    setOpen(true);
    onDropDoc(docId, folder.id);
  }

  function commitRename() {
    const name = draft.trim();
    if (name && name !== folder.name) onRename(folder.id, name);
    setRenaming(false);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-md border transition-colors ${
        dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="group flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-0.5 rounded hover:bg-gray-200 transition-colors shrink-0"
          aria-label={open ? "Collapse folder" : "Expand folder"}
        >
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
        </button>
        <Folder className="w-4 h-4 text-blue-500 shrink-0" />

        {renaming ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraft(folder.name);
                  setRenaming(false);
                }
              }}
              className="flex-1 min-w-0 h-7 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={commitRename}
              className="p-1 rounded hover:bg-gray-200"
              aria-label="Save name"
            >
              <Check className="w-3.5 h-3.5 text-green-600" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(folder.name);
                setRenaming(false);
              }}
              className="p-1 rounded hover:bg-gray-200"
              aria-label="Cancel rename"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-sm font-semibold text-gray-900 truncate flex-1 text-left min-w-0"
            >
              {folder.name}
            </button>
            <span className="text-xs text-gray-400 shrink-0">
              {folder.docCount} {folder.docCount === 1 ? "doc" : "docs"}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {canCreateDoc && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMenuOpen((v) => !v)}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                    aria-label="New doc in folder"
                    title="New doc in this folder"
                  >
                    <Plus className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                  {menuOpen && (
                    <TemplateMenu
                      onPick={(key) => {
                        setMenuOpen(false);
                        setOpen(true);
                        onCreateDoc(folder.id, key);
                      }}
                      onClose={() => setMenuOpen(false)}
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraft(folder.name);
                  setRenaming(true);
                }}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                aria-label="Rename folder"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(folder)}
                className="p-1.5 rounded hover:bg-red-100 transition-colors"
                aria-label="Delete folder"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-gray-100">
          <DocsTableHeader />
          <PaginatedDocList
            projectId={projectId}
            docs={docs}
            loaded={list.isSuccess}
            loading={list.isLoading}
            hasNextPage={!!list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            fetchNextPage={() => list.fetchNextPage()}
            onDownload={onDownload}
            onDragStart={onDragStartDoc}
            canDelete={canDeleteDoc}
            onDelete={onDeleteDoc}
            emptyText="No docs in this folder yet."
          />
        </div>
      )}
    </div>
  );
}
