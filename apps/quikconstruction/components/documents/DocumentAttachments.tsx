"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Download, Upload } from "lucide-react";

interface Doc {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string;
}

interface Props {
  refType: string;
  refId: string;
  /// if true, hides upload controls (viewing a posted/locked doc)
  readOnly?: boolean;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function DocumentAttachments({ refType, refId, readOnly }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/documents?refType=${refType}&refId=${refId}`);
    const j = await r.json();
    if (j.success) setDocs(j.data);
  }, [refType, refId]);
  useEffect(() => { refresh(); }, [refresh]);

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("refType", refType);
      form.set("refId", refId);
      const r = await fetch("/api/documents", { method: "POST", body: form });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Upload failed");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function remove(doc: Doc) {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex-1">Attachments ({docs.length})</h2>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-accent-100 file:text-accent-700 file:font-semibold hover:file:bg-accent-200" />
            <button onClick={upload} disabled={busy} className="text-xs inline-flex items-center gap-1 bg-accent-600 text-white px-2 py-1 rounded hover:bg-accent-700 disabled:opacity-50">
              <Upload className="h-3 w-3" /> {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        )}
      </div>
      {err && <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{err}</div>}
      {docs.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-500">No attachments yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="truncate text-gray-900">{d.fileName}</div>
                <div className="text-[11px] text-gray-500">{fmtBytes(d.sizeBytes)} · {d.mimeType} · {new Date(d.createdAt).toISOString().slice(0, 10)}</div>
              </div>
              <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-accent-600 p-1" title="Download"><Download className="h-3.5 w-3.5" /></a>
              {!readOnly && <button onClick={() => remove(d)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
