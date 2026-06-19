"use client";

/**
 * DocumentAttachments — list, upload, and delete files attached to an
 * arbitrary entity (`refType` + `refId`).
 *
 * Backend: `/api/documents` (list/upload), `/api/documents/[id]` (delete),
 * `/api/documents/[id]/download` (signed URL or stream).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Upload, Download, Trash2, FileIcon } from "lucide-react";

interface DocRow {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface Props {
  refType: string;
  refId: string;
  /** Disable upload + delete (read-only view). */
  readOnly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentAttachments({ refType, refId, readOnly }: Props) {
  const [items, setItems] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/documents?refType=${encodeURIComponent(refType)}&refId=${encodeURIComponent(refId)}`);
      const j = await r.json();
      if (j?.success === false) throw new Error(j.error ?? "Failed to load");
      const list: DocRow[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [refType, refId]);

  useEffect(() => { load(); }, [load]);

  const onPick = () => fileRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("refType", refType);
      fd.append("refId", refId);
      fd.append("file", file);
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const j = await r.json();
      if (j?.success === false) throw new Error(j.error ?? "Upload failed");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (doc: DocRow) => {
    if (!window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (r.ok || j?.success !== false) {
        setItems((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        setError(j?.error ?? "Delete failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-400" />
          Attachments
          {items.length > 0 && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {items.length}
            </span>
          )}
        </h2>
        {!readOnly && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={onUpload}
            />
            <button
              type="button"
              onClick={onPick}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </>
        )}
      </header>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-100">
          {error}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="px-4 py-6 text-xs text-slate-400 text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-xs text-slate-400 text-center">
            {readOnly ? "No attachments." : "No attachments yet — click Upload to add one."}
          </div>
        ) : (
          items.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors">
              <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <FileIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>
                <p className="text-[11px] text-slate-500">
                  {formatSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <a
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md text-slate-400 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(doc)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
