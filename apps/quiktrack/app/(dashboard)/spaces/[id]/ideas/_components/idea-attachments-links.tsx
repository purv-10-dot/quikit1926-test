"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Link2, X, FileText, Loader2, Search, Plus } from "lucide-react";
import { uploadProjectImage } from "@/lib/upload-image";
import { TYPE_META, type IssueType } from "@/app/(dashboard)/spaces/[id]/list/_components/list-types";

/** Work-type icon (Task/Bug/Story/Epic/Subtask), matching the Delivery search. */
function TypeIcon({ type }: { type: string }) {
  const meta = TYPE_META[(type as IssueType)] ?? TYPE_META.TASK;
  const Icon = meta.Icon;
  return <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />;
}

interface Attachment { id: string; fileName: string; url: string; mimeType?: string | null; size?: number | null; createdAt: string }
interface LinkRow { id: string; linkType: string; issueId: string; key: string; title: string; type: string; status: string | null; statusCategory: string | null; projectName: string | null }
interface SearchItem { id: string; key: string; title: string; type: string; projectName?: string | null }

const LINK_TYPES = ["relates to"];

/**
 * Idea "Add attachment" + "Link work item" (JPD). Attachments upload via the docs
 * pipeline and list with name/date. Linked work items = a Link Type + a searchable
 * work-item picker (current space), persisted via the links API.
 */
export function IdeaAttachmentsLinks({ projectId, ideaId }: { projectId: string; ideaId: string }) {
  const base = `/api/projects/${projectId}/ideas/${ideaId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const [linking, setLinking] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linkType, setLinkType] = useState("relates to");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`${base}/attachments`).then((r) => r.json()).then((j) => { if (alive && j.success) setAttachments(j.data); }).catch(() => undefined);
    fetch(`${base}/links`).then((r) => r.json()).then((j) => { if (alive && j.success) setLinks(j.data); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ideaId]);

  // Work-item search (current space) while the linker is open.
  useEffect(() => {
    if (!linking) return;
    let alive = true;
    const t = setTimeout(() => {
      // Global search across all projects the user can access (JPD).
      fetch(`${base}/links/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => { if (alive && j.success) setResults((j.data ?? []) as SearchItem[]); })
        .catch(() => undefined);
    }, 200);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking, q, projectId, ideaId]);

  async function onFile(file: File) {
    setUploading(true);
    try {
      // Images go through the docs upload pipeline (returns a small proxy URL).
      // Other files are stored inline as a data URL so attachments work without
      // cloud storage configured. Cap at ~4MB to keep the row reasonable.
      let url: string;
      if (file.type.startsWith("image/")) {
        url = await uploadProjectImage(projectId, file);
      } else {
        if (file.size > 4 * 1024 * 1024) { alert("File is too large (max 4 MB)."); return; }
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Read failed"));
          reader.readAsDataURL(file);
        });
      }
      const res = await fetch(`${base}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, url, mimeType: file.type || undefined, size: file.size }),
      });
      const j = await res.json();
      if (res.ok && j.success) setAttachments((a) => [j.data, ...a]);
      else alert(j?.error ?? "Couldn’t save attachment");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); }
  }

  async function removeAttachment(id: string) {
    const res = await fetch(`${base}/attachments/${id}`, { method: "DELETE" });
    if (res.ok) setAttachments((a) => a.filter((x) => x.id !== id));
  }

  async function addLink(item: SearchItem) {
    const res = await fetch(`${base}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: item.id, linkType }),
    });
    if (res.ok) {
      const refreshed = await fetch(`${base}/links`).then((r) => r.json());
      if (refreshed.success) setLinks(refreshed.data);
      setQ("");
    }
  }

  async function removeLink(id: string) {
    const res = await fetch(`${base}/links/${id}`, { method: "DELETE" });
    if (res.ok) setLinks((l) => l.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} Add attachment
        </button>
        <button type="button" onClick={() => setLinking((v) => !v)} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm ${linking ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
          <Link2 className="h-3.5 w-3.5" /> Link work item
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </div>

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">Attachments ({attachments.length})</p>
          <div className="flex flex-wrap gap-3">
            {attachments.map((a) => (
              <div key={a.id} className="group relative w-40 overflow-hidden rounded border border-gray-200">
                <a href={a.url} target="_blank" rel="noreferrer" className="block">
                  <div className="grid h-24 place-items-center bg-gray-50 text-gray-400"><FileText className="h-8 w-8" /></div>
                  <div className="border-t border-gray-100 p-2">
                    <p className="truncate text-xs font-medium text-gray-700" title={a.fileName}>{a.fileName}</p>
                    <p className="text-[11px] text-gray-400">{new Date(a.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </a>
                <button type="button" aria-label="Remove" onClick={() => void removeAttachment(a.id)} className="absolute right-1 top-1 hidden rounded bg-white/90 p-0.5 text-gray-400 shadow hover:text-red-600 group-hover:block">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked work items */}
      {(links.length > 0 || linking) && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">Linked work items</p>
          {linking && (
            <div className="mb-3 space-y-2 rounded border border-gray-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Link Type</label>
                <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  {LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-400" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a work item" className="w-full rounded border border-gray-300 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
                </div>
                {results.length > 0 && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-sm">
                    {results.map((it) => (
                      <button key={it.id} type="button" onClick={() => void addLink(it)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                        <TypeIcon type={it.type} />
                        <span className="font-medium tabular-nums text-gray-500">{it.key}</span>
                        <span className="truncate">{it.title}</span>
                        <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li key={l.id} className="group flex items-center gap-2 rounded border border-gray-100 px-2 py-1.5 text-sm">
                <span className="text-xs text-gray-400">{l.linkType}</span>
                <TypeIcon type={l.type} />
                <span className="font-medium tabular-nums text-gray-500">{l.key}</span>
                <span className="min-w-0 flex-1 truncate text-gray-800">{l.title}</span>
                {l.status && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{l.status.toUpperCase()}</span>}
                <button type="button" aria-label="Unlink" onClick={() => void removeLink(l.id)} className="rounded p-1 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
