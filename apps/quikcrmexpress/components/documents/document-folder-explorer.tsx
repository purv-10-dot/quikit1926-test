"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { LayoutGrid, List, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { FolderBreadcrumbs } from "@/components/documents/folder-breadcrumbs";
import { FolderTree } from "@/components/documents/folder-tree";
import { GlobalFolderTree } from "@/components/documents/global-folder-tree";
import { FolderGrid } from "@/components/documents/folder-grid";
import { ExplorerModuleGrid } from "@/components/documents/explorer-module-grid";
import { ExplorerEntityList } from "@/components/documents/explorer-entity-list";
import { CreateFolderModal } from "@/components/documents/create-folder-modal";
import { RenameFolderModal } from "@/components/documents/rename-folder-modal";
import { UploadMenu } from "@/components/documents/upload-menu";
import {
  DocumentPickerModal,
  type PickerMode,
} from "@/components/documents/document-picker-modal";
import type { DocumentDto } from "@/lib/services/documents/types";
import type { DocumentRefType } from "@/lib/services/documents/types";
import type { FolderDto, FolderScope } from "@/lib/services/document-folders/types";
import type { ExplorerLocation } from "@/lib/services/document-folders/explorer-location";
import {
  createFolderApi,
  decodeLocation,
  deleteFolderApi,
  encodeLocation,
  fetchFolderContents,
  fetchGlobalExplorerContents,
  isGlobalFolderScope,
  moveDocumentApi,
  moveFolderApi,
  renameFolderApi,
} from "@/lib/documents/folder-client";
import type { GlobalExplorerContentsResult } from "@/lib/services/document-folders/types";
import { DOCUMENT_UPLOAD_REQUEST_EVENT } from "@/lib/documents/upload-request-event";

const API_SEGMENT: Record<DocumentRefType, string> = {
  lead: "leads",
  account: "accounts",
  opportunity: "opportunities",
  quote: "quotes",
  order: "orders",
};

interface Props {
  scope: FolderScope;
  readOnly?: boolean;
}

function FolderDropZone({
  dropId,
  children,
  uploading,
  uploadingFileName,
}: {
  dropId: string;
  children: React.ReactNode;
  uploading?: boolean;
  uploadingFileName?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={
        "relative min-h-[200px] rounded-lg " +
        (isOver ? "ring-2 ring-accent-400 ring-offset-2" : "")
      }
    >
      {uploading ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/80 px-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Uploading document"
        >
          <Loader2 className="h-9 w-9 animate-spin text-accent-600" />
          <p className="text-sm font-semibold text-crm-text">Uploading document…</p>
          {uploadingFileName ? (
            <p className="max-w-md truncate text-xs text-crm-muted">{uploadingFileName}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function effectiveScope(
  scope: FolderScope,
  location: ExplorerLocation,
): FolderScope {
  if (!isGlobalFolderScope(scope)) return scope;
  if (location.kind === "entity") {
    return { refType: location.refType, refId: location.refId };
  }
  if (location.kind === "folder") {
    return scope;
  }
  if (location.kind === "module" && location.module === "global") {
    return { refType: null, refId: null };
  }
  return scope;
}

function canUploadAt(
  scope: FolderScope,
  location: ExplorerLocation,
  folderId: string | null,
): boolean {
  if (!isGlobalFolderScope(scope)) {
    return Boolean(scope.refType && scope.refId);
  }
  if (location.kind === "entity") return true;
  if (location.kind === "folder") return true;
  if (location.kind === "module" && location.module === "global") return true;
  return false;
}

function canCreateFolderAt(scope: FolderScope, location: ExplorerLocation): boolean {
  if (!isGlobalFolderScope(scope)) return true;
  if (location.kind === "entity") return true;
  if (location.kind === "module" && location.module === "global") return true;
  if (location.kind === "folder") return true;
  return false;
}

function canAttachAt(
  scope: FolderScope,
  location: ExplorerLocation,
  _folderId: string | null,
): boolean {
  if (!isGlobalFolderScope(scope)) {
    return Boolean(scope.refType && scope.refId);
  }
  if (location.kind === "entity") return true;
  if (location.kind === "folder") return true;
  if (location.kind === "module" && location.module === "global") return true;
  return false;
}

function resolveLinkTarget(
  scope: FolderScope,
  location: ExplorerLocation,
  currentFolderId: string | null,
  globalContents: GlobalExplorerContentsResult | null,
): { targetFolderId: string | null; refType: string | null; refId: string | null } {
  if (!isGlobalFolderScope(scope)) {
    return {
      targetFolderId: currentFolderId,
      refType: scope.refType ?? null,
      refId: scope.refId ?? null,
    };
  }
  if (location.kind === "entity") {
    return {
      targetFolderId: currentFolderId,
      refType: location.refType,
      refId: location.refId,
    };
  }
  if (location.kind === "folder") {
    const folder = globalContents?.folder;
    return {
      targetFolderId: location.folderId,
      refType: folder?.refType ?? null,
      refId: folder?.refId ?? null,
    };
  }
  if (location.kind === "module" && location.module === "global") {
    return {
      targetFolderId: currentFolderId,
      refType: null,
      refId: null,
    };
  }
  return { targetFolderId: null, refType: null, refId: null };
}

export function DocumentFolderExplorer({ scope, readOnly = false }: Props) {
  const globalMode = isGlobalFolderScope(scope);

  const [location, setLocation] = useState<ExplorerLocation>({ kind: "root" });
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [entityContents, setEntityContents] = useState<
    Awaited<ReturnType<typeof fetchFolderContents>> | null
  >(null);
  const [globalContents, setGlobalContents] = useState<GlobalExplorerContentsResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderDto | null>(null);
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const entityRefType = scope.refType;
    const entityRefId = scope.refId;
    if (!entityRefType || !entityRefId || readOnly) return;

    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<{ refType: string; refId: string }>).detail;
      if (detail?.refType !== entityRefType || detail?.refId !== entityRefId) return;
      if (!canUploadAt(scope, location, currentFolderId)) return;
      fileRef.current?.click();
    };

    window.addEventListener(DOCUMENT_UPLOAD_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(DOCUMENT_UPLOAD_REQUEST_EVENT, onRequest);
  }, [scope, location, currentFolderId, readOnly]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const bump = () => setRefreshKey((k) => k + 1);

  const activeScope = globalMode
    ? effectiveScope(scope, location)
    : scope;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (globalMode) {
        const data = await fetchGlobalExplorerContents(location, q);
        setGlobalContents(data);
        setEntityContents(null);
        if (location.kind === "folder") {
          setCurrentFolderId(location.folderId);
        } else if (location.kind === "entity") {
          setCurrentFolderId(null);
        } else {
          setCurrentFolderId(null);
        }
      } else {
        const data = await fetchFolderContents(scope, currentFolderId, q);
        setEntityContents(data);
        setGlobalContents(null);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [globalMode, location, scope, currentFolderId, q]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function navigateTo(navKey: string | null) {
    if (globalMode) {
      const loc = decodeLocation(navKey);
      setLocation(loc);
      setCurrentFolderId(loc.kind === "folder" ? loc.folderId : null);
      return;
    }
    if (!navKey || navKey === "root") {
      setCurrentFolderId(null);
    } else {
      setCurrentFolderId(navKey);
    }
  }

  function openFolder(folderId: string) {
    if (globalMode) {
      setLocation({ kind: "folder", folderId });
      setCurrentFolderId(folderId);
    } else {
      setCurrentFolderId(folderId);
    }
  }

  async function handleUpload(file: File) {
    if (readOnly) return;
    setUploading(true);
    setUploadingFileName(file.name);
    setErr(null);
    try {
      const uploadScope = globalMode ? effectiveScope(scope, location) : scope;
      if (uploadScope.refType && uploadScope.refId) {
        const form = new FormData();
        form.set("file", file);
        const folderId =
          location.kind === "folder" ? location.folderId : currentFolderId;
        if (folderId) form.set("folderId", folderId);
        const base = `/api/${API_SEGMENT[uploadScope.refType]}/${uploadScope.refId}/attachments`;
        const res = await fetch(base, { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
      } else if (globalMode && location.kind === "folder") {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/document-folders/${location.folderId}/files`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
      } else if (globalMode && location.kind === "module" && location.module === "global") {
        const form = new FormData();
        form.set("file", file);
        const folderId = currentFolderId ?? null;
        if (folderId) {
          const res = await fetch(`/api/document-folders/${folderId}/files`, {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
        } else {
          const res = await fetch("/api/documents", { method: "POST", body: form });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
        }
      } else {
        throw new Error("Open a record or folder before uploading");
      }
      if (fileRef.current) fileRef.current.value = "";
      bump();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingFileName(null);
    }
  }

  async function handleDeleteFile(file: DocumentDto) {
    if (readOnly) return;
    const msg = file.isLink
      ? `Remove link to "${file.fileName}" from this folder?`
      : `Delete "${file.fileName}" permanently?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      if (file.isLink && file.linkId) {
        const res = await fetch(`/api/document-links/${file.linkId}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Remove failed");
      } else if (file.refType === "global") {
        const res = await fetch(`/api/documents/${file.id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Delete failed");
      } else {
        const refType = file.refType as DocumentRefType;
        const base = `/api/${API_SEGMENT[refType]}/${file.refId}/attachments/${file.id}`;
        const res = await fetch(base, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "Delete failed");
      }
      bump();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("folder-drop:")) return;
    const targetKey = overId.replace("folder-drop:", "");
    const target =
      targetKey === "root" ? null : targetKey.startsWith("folder:") ? targetKey.replace("folder:", "") : targetKey;

    try {
      const activeId = String(active.id);
      if (activeId.startsWith("file:")) {
        await moveDocumentApi(activeId.replace("file:", ""), target);
      } else if (activeId.startsWith("folder:")) {
        await moveFolderApi(activeId.replace("folder:", ""), target);
      }
      bump();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Move failed");
    }
  }

  const breadcrumbs =
    globalContents?.breadcrumbs ??
    entityContents?.breadcrumbs ??
    [{ id: null, name: "Documents", navKey: "root" }];

  const folders = globalContents?.folders ?? entityContents?.folders ?? [];
  const files = globalContents?.files ?? entityContents?.files ?? [];
  const modules = globalContents?.modules ?? [];
  const entities = globalContents?.entities ?? [];

  const showModuleGrid = globalMode && location.kind === "root";
  const showEntityList = globalMode && location.kind === "module" && location.module !== "global";
  const showFolderGrid =
    !showModuleGrid &&
    !showEntityList &&
    (folders.length > 0 || files.length > 0 || !loading);

  const createFolderScope = (): {
    refType: DocumentRefType | null;
    refId: string | null;
    parentFolderId: string | null;
  } => {
    if (!globalMode) {
      return {
        refType: scope.refType ?? null,
        refId: scope.refId ?? null,
        parentFolderId: currentFolderId,
      };
    }
    if (location.kind === "entity") {
      return {
        refType: location.refType,
        refId: location.refId,
        parentFolderId: currentFolderId,
      };
    }
    if (location.kind === "module" && location.module === "global") {
      return { refType: null, refId: null, parentFolderId: currentFolderId };
    }
    if (location.kind === "folder") {
      const row = globalContents?.folder;
      return {
        refType: row?.refType ?? null,
        refId: row?.refId ?? null,
        parentFolderId: location.folderId,
      };
    }
    return { refType: null, refId: null, parentFolderId: null };
  };

  const dropId = globalMode
    ? `folder-drop:${location.kind === "folder" ? location.folderId : encodeLocation(location)}`
    : `folder-drop:${currentFolderId ?? "root"}`;

  return (
    <div className="flex min-h-[420px] flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 rounded-lg border border-crm-border bg-white p-3 lg:w-64">
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">
          Folders
        </p>
        {globalMode ? (
          <GlobalFolderTree
            location={location}
            onNavigate={setLocation}
            refreshKey={refreshKey}
          />
        ) : (
          <FolderTree
            scope={scope}
            activeFolderId={currentFolderId}
            onSelect={setCurrentFolderId}
            refreshKey={refreshKey}
          />
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FolderBreadcrumbs items={breadcrumbs} onNavigate={navigateTo} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted" />
              <Input
                className="h-9 w-40 pl-8 text-sm"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") bump();
                }}
              />
            </div>
            <button
              type="button"
              className={"crm-btn-ghost p-2 " + (view === "grid" ? "text-accent-700" : "")}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={"crm-btn-ghost p-2 " + (view === "table" ? "text-accent-700" : "")}
              onClick={() => setView("table")}
            >
              <List size={16} />
            </button>
            {!readOnly && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                  }}
                />
                <UploadMenu
                  disabled={!canUploadAt(scope, location, currentFolderId) && !canAttachAt(scope, location, currentFolderId)}
                  busy={busy}
                  uploading={uploading}
                  canUpload={canUploadAt(scope, location, currentFolderId)}
                  canAttach={canAttachAt(scope, location, currentFolderId)}
                  canCreateFolder={canCreateFolderAt(scope, location)}
                  onUploadDevice={() => fileRef.current?.click()}
                  onAttachGlobal={() => setPickerMode("global")}
                  onCreateFolder={() => setCreateOpen(true)}
                />
              </>
            )}
          </div>
        </div>

        {uploading ? (
          <div
            className="flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-950"
            role="status"
          >
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent-600" />
            <div className="min-w-0">
              <p className="font-semibold">Upload in progress…</p>
              {uploadingFileName ? (
                <p className="truncate text-xs text-accent-900/80">{uploadingFileName}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {err && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveDrag(String(e.active.id))}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <FolderDropZone
            dropId={dropId}
            uploading={uploading}
            uploadingFileName={uploadingFileName}
          >
            {loading ? (
              <p className="py-12 text-center text-sm text-crm-muted">Loading…</p>
            ) : showModuleGrid ? (
              <ExplorerModuleGrid modules={modules} onOpen={navigateTo} />
            ) : showEntityList ? (
              <ExplorerEntityList entities={entities} onOpen={navigateTo} />
            ) : showFolderGrid ? (
              <FolderGrid
                folders={folders}
                files={files}
                view={view}
                readOnly={readOnly}
                onOpenFolder={openFolder}
                onPreviewFile={setPreview}
                onDeleteFile={handleDeleteFile}
                onFolderAction={(folder, action) => {
                  if (action === "rename") setRenameTarget(folder);
                  if (action === "delete") {
                    const recursive = window.confirm(
                      "Delete folder and all nested items?",
                    );
                    void deleteFolderApi(folder.id, recursive).then(() => bump());
                  }
                }}
              />
            ) : (
              <p className="py-12 text-center text-sm text-crm-muted">
                {globalMode && location.kind === "module"
                  ? "Select a record from the list or open a folder in the sidebar."
                  : "This folder is empty."}
              </p>
            )}
          </FolderDropZone>
          <DragOverlay>
            {activeDrag ? (
              <span className="rounded bg-accent-100 px-2 py-1 text-xs shadow">Moving…</span>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <CreateFolderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (name) => {
          const cfg = createFolderScope();
          await createFolderApi({
            name,
            parentFolderId: cfg.parentFolderId,
            refType: cfg.refType,
            refId: cfg.refId,
          });
          bump();
        }}
      />

      {renameTarget && (
        <RenameFolderModal
          open
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onRename={async (name) => {
            await renameFolderApi(renameTarget.id, name);
            setRenameTarget(null);
            bump();
          }}
        />
      )}

      {preview && (
        <DocumentPreviewModal
          open
          onClose={() => setPreview(null)}
          fileName={preview.fileName}
          contentType={preview.contentType}
          downloadUrl={preview.downloadUrl}
        />
      )}

      {pickerMode && (
        <DocumentPickerModal
          open
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          linkTarget={resolveLinkTarget(scope, location, currentFolderId, globalContents)}
          onLinked={() => bump()}
        />
      )}
    </div>
  );
}
