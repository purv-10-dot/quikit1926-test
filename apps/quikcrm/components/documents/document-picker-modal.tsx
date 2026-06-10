"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Link2, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlobalFolderTree } from "@/components/documents/global-folder-tree";
import { FolderBreadcrumbs } from "@/components/documents/folder-breadcrumbs";
import {
  canPreviewContentType,
  FileTypeIcon,
  formatFileSize,
} from "@/components/documents/file-type-icon";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import type { DocumentDto } from "@/lib/services/documents/types";
import type { ExplorerLocation } from "@/lib/services/document-folders/explorer-location";
import {
  decodeLocation,
  encodeLocation,
} from "@/lib/services/document-folders/explorer-location";
import { getModuleLabel } from "@/lib/services/document-folders/module-labels";
import type { BreadcrumbItem } from "@/lib/services/document-folders/types";
import { DOCUMENT_REF_TYPES } from "@/lib/services/documents/types";

export type PickerMode = "global" | "existing" | "recent";

interface LinkTarget {
  targetFolderId: string | null;
  refType: string | null;
  refId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mode: PickerMode;
  linkTarget: LinkTarget;
  onLinked: () => void;
}

async function fetchPicker(params: Record<string, string>) {
  const p = new URLSearchParams(params);
  const res = await fetch(`/api/document-picker?${p}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load files");
  return json.data as {
    items: DocumentDto[];
    total: number;
    location: ExplorerLocation;
  };
}

async function createLink(body: LinkTarget & { sourceDocumentId: string }) {
  const res = await fetch("/api/document-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to attach file");
}

const MODE_TITLES: Record<PickerMode, string> = {
  global: "Attach from QuikCRM Global Files",
  existing: "Attach existing CRM document",
  recent: "Recent CRM documents",
};

export function DocumentPickerModal({ open, onClose, mode, linkTarget, onLinked }: Props) {
  const [pickerLocation, setPickerLocation] = useState<ExplorerLocation>({ kind: "root" });
  const [items, setItems] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [refFilter, setRefFilter] = useState("");
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: "Documents", navKey: "root" },
  ]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    try {
      const params: Record<string, string> = {
        location: encodeLocation(pickerLocation),
        page: "1",
        pageSize: "30",
        excludeFolderId: linkTarget.targetFolderId ?? "null",
        excludeRefType: linkTarget.refType ?? "",
        excludeRefId: linkTarget.refId ?? "",
      };
      if (q.trim()) params.q = q.trim();
      if (refFilter) params.refType = refFilter;
      if (mode === "recent") params.recent = "1";

      const data = await fetchPicker(params);
      setItems(data.items);
      const crumbs: BreadcrumbItem[] = [
        { id: null, name: "Documents", navKey: "root" },
      ];
      if (pickerLocation.kind === "module") {
        crumbs.push({
          id: `module:${pickerLocation.module}`,
          name: getModuleLabel(pickerLocation.module),
          navKey: encodeLocation(pickerLocation),
        });
      }
      if (pickerLocation.kind === "entity") {
        crumbs.push({
          id: `module:${pickerLocation.refType}`,
          name: getModuleLabel(pickerLocation.refType),
          navKey: encodeLocation({ kind: "module", module: pickerLocation.refType }),
        });
        crumbs.push({
          id: `entity:${pickerLocation.refId}`,
          name: pickerLocation.refId.slice(0, 8),
          navKey: encodeLocation(pickerLocation),
        });
      }
      setBreadcrumbs(crumbs);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [open, pickerLocation, q, refFilter, mode, linkTarget]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setPickerLocation({ kind: "root" });
      setQ("");
      setRefFilter("");
      setErr(null);
    }
  }, [open]);

  async function attach(doc: DocumentDto) {
    setBusy(true);
    setErr(null);
    try {
      await createLink({
        sourceDocumentId: doc.sourceDocumentId ?? doc.id,
        targetFolderId: linkTarget.targetFolderId,
        refType: linkTarget.refType,
        refId: linkTarget.refId,
      });
      onLinked();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Attach failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={MODE_TITLES[mode]} width="max-w-5xl">
        <div className="space-y-3">
          <p className="text-sm text-crm-muted">
            Select a file to attach. The same file is reused — nothing is uploaded to S3 again.
          </p>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted" />
              <Input
                className="pl-9"
                placeholder="Search file name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
              />
            </div>
            {mode === "existing" && (
              <select
                className="crm-input h-10 min-w-[140px]"
                value={refFilter}
                onChange={(e) => setRefFilter(e.target.value)}
              >
                <option value="">All modules</option>
                {DOCUMENT_REF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="global">Global</option>
              </select>
            )}
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Search
            </Button>
          </div>

          {err && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="flex min-h-[360px] gap-3 border-t border-crm-border pt-3">
            {mode !== "recent" && (
              <aside className="w-52 shrink-0 overflow-auto rounded border border-crm-border bg-white p-2">
                <GlobalFolderTree
                  location={pickerLocation}
                  onNavigate={setPickerLocation}
                  refreshKey={0}
                />
              </aside>
            )}

            <div className="min-w-0 flex-1">
              {mode !== "recent" && (
                <FolderBreadcrumbs
                  items={breadcrumbs}
                  onNavigate={(key) => setPickerLocation(decodeLocation(key))}
                />
              )}

              {loading ? (
                <p className="py-12 text-center text-sm text-crm-muted">Loading files…</p>
              ) : items.length === 0 ? (
                <p className="py-12 text-center text-sm text-crm-muted">No files found</p>
              ) : (
                <ul className="mt-2 max-h-[320px] divide-y divide-crm-border overflow-auto rounded-lg border border-crm-border">
                  {items.map((d) => (
                    <li
                      key={d.sourceDocumentId ?? d.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--color-bg-secondary)]"
                    >
                      <FileTypeIcon
                        contentType={d.contentType}
                        className="h-5 w-5 shrink-0 text-accent-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.fileName}</div>
                        <div className="text-xs text-crm-muted">
                          {formatFileSize(d.size)}
                          {d.relatedLabel ? ` · ${d.relatedLabel}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {canPreviewContentType(d.contentType) && (
                          <button
                            type="button"
                            className="rounded p-1.5 text-crm-muted hover:text-accent-700"
                            onClick={() => setPreview(d)}
                          >
                            <Eye size={16} />
                          </button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          className="h-8 px-2 text-xs"
                          onClick={() => void attach(d)}
                        >
                          <Link2 size={14} className="mr-1" />
                          Attach
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {preview && (
        <DocumentPreviewModal
          open
          onClose={() => setPreview(null)}
          fileName={preview.fileName}
          contentType={preview.contentType}
          downloadUrl={preview.downloadUrl}
        />
      )}
    </>
  );
}
