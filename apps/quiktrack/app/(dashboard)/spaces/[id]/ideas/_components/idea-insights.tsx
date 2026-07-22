"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  TrendingUp,
  Tag,
  Link as LinkIcon,
  Globe,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import { uploadProjectImage } from "@/lib/upload-image";

/**
 * Insights tab for the idea detail panel (JPD). "Create an insight" opens a
 * composer (body + optional source URL → link-preview card + Impact rating +
 * Labels). Below: search / filter / sort and the insight list. Talks to
 * /api/projects/[id]/ideas/[ideaId]/insights. `onCountChange` keeps the tab
 * badge in sync.
 */

interface InsightRow {
  id: string;
  body: string;
  url: string | null;
  impact: number;
  labels: string[];
  authorName: string;
  createdBy: string | null;
  createdAt: string;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

/** Strip HTML to test whether a rich-text value is really empty. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Best-effort hostname for the link card (no server scrape). */
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function titleOf(url: string): string {
  const h = hostOf(url);
  const name = h.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function IdeaInsights({
  projectId,
  ideaId,
  onCountChange,
}: {
  projectId: string;
  ideaId: string;
  onCountChange?: (n: number) => void;
}) {
  const base = `/api/projects/${projectId}/ideas/${ideaId}/insights`;
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  // Composer draft.
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [impact, setImpact] = useState(0);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(base);
      const json = (await res.json()) as { success: boolean; data?: InsightRow[] };
      if (json.success && json.data) { setInsights(json.data); onCountChange?.(json.data.length); }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ideaId]);

  function resetComposer() {
    setBody(""); setUrl(""); setImpact(0); setLabels([]); setLabelDraft(""); setCreating(false);
  }

  async function create() {
    if (!plainText(body)) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          url: url.trim() || null,
          impact,
          labels,
        }),
      });
      if (res.ok) { resetComposer(); await load(); }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(i: InsightRow) { setEditingId(i.id); setEditBody(i.body); }

  async function saveEdit(id: string) {
    if (!plainText(editBody)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      if (res.ok) { setEditingId(null); setEditBody(""); await load(); }
    } finally {
      setBusy(false);
    }
  }

  function addLabel() {
    const l = labelDraft.trim();
    if (l && !labels.includes(l)) setLabels((ls) => [...ls, l]);
    setLabelDraft("");
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? insights.filter((i) => i.body.toLowerCase().includes(q) || (i.url ?? "").toLowerCase().includes(q) || i.labels.some((l) => l.toLowerCase().includes(q)))
      : insights;
    return [...list].sort((a, b) => {
      const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDesc ? -d : d;
    });
  }, [insights, search, sortDesc]);

  // Empty state (no insights, not composing) → the JPD purple "Capture
  // insights" card. Once any insight exists (or while composing) → the compact
  // header + search/filter/sort.
  const showEmptyState = !loading && insights.length === 0 && !creating;

  return (
    <div className="space-y-3">
      {creating ? (
        <InsightComposer
          projectId={projectId}
          body={body} setBody={setBody}
          url={url} setUrl={setUrl}
          impact={impact} setImpact={setImpact}
          labels={labels} setLabels={setLabels}
          labelDraft={labelDraft} setLabelDraft={setLabelDraft}
          addLabel={addLabel}
          busy={busy}
          onCreate={() => void create()}
          onCancel={resetComposer}
        />
      ) : showEmptyState ? (
        <CaptureInsightsCard onCreate={() => setCreating(true)} />
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setCreating(true)} className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700">
              Create an insight
            </button>
          </div>

          {/* Search / filter / sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full rounded border border-gray-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <button type="button" className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <Filter className="h-3.5 w-3.5 text-gray-500" /> Filter
            </button>
            <button type="button" onClick={() => setSortDesc((v) => !v)} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" /> Sort
            </button>
          </div>
        </>
      )}

      {/* List */}
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : visible.length === 0 ? (
        showEmptyState ? null : <p className="py-8 text-center text-sm text-gray-500">No matching insights.</p>
      ) : (
        <ul className="space-y-5">
          {visible.map((i) => (
            <li key={i.id} className="group/insight border-b border-gray-100 pb-4 last:border-0">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600" />
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-600 text-[10px] font-medium text-white">
                  {initials(i.authorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{i.authorName}</span>
                    <span className="text-xs text-gray-400">{timeAgo(i.createdAt)}</span>
                    {/* Inline actions (JPD): edit / delete / copy-link, on hover. */}
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/insight:opacity-100">
                      <button type="button" aria-label="Edit insight" onClick={() => startEdit(i)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Delete insight" onClick={() => void remove(i.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Copy link" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <LinkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  {editingId === i.id ? (
                    <div className="mt-1">
                      <RichTextEditor value={editBody} onChange={setEditBody} uploadImage={(file) => uploadProjectImage(projectId, file)} />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" disabled={busy || !plainText(editBody)} onClick={() => void saveEdit(i.id)} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                          Save
                        </button>
                        <button type="button" onClick={() => { setEditingId(null); setEditBody(""); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 border-l-2 border-gray-200 pl-3">
                      <div
                        className="text-sm text-gray-800 [&_a]:text-blue-600 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichText(i.body) }}
                      />
                      {i.url && <LinkCard url={i.url} />}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Impact <ImpactDots value={i.impact} />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" /> Labels
                      {i.labels.length === 0 ? (
                        <span className="text-gray-400">None</span>
                      ) : (
                        i.labels.map((l) => (
                          <span key={l} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{l}</span>
                        ))
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** JPD empty-state: the purple "Capture insights" card shown before any exist. */
function CaptureInsightsCard({ onCreate }: { onCreate: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    return (
      <button type="button" onClick={onCreate} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
        Create an insight
      </button>
    );
  }
  return (
    <div className="relative rounded-lg bg-purple-50 p-4">
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="absolute right-3 top-3 rounded p-0.5 text-gray-400 hover:bg-purple-100 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
      <h3 className="text-sm font-semibold text-gray-900">Capture insights</h3>
      <p className="mt-1 pr-6 text-sm leading-relaxed text-gray-600">
        You can bring qualitative and quantitative data points such as quotes, images, and
        conversations into an idea manually as an insight.
      </p>
      <button type="button" onClick={onCreate} className="mt-4 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
        Create an insight
      </button>
    </div>
  );
}

/** 5-dot impact rating (read-only in the list). */
function ImpactDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`rounded-full ${i < value ? "h-2 w-2 bg-blue-400" : "h-1 w-1 bg-gray-300"}`} />
      ))}
    </span>
  );
}

/** Editable impact dots (composer). */
function ImpactPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1 === value ? 0 : i + 1)} className="grid h-3.5 w-3.5 place-items-center">
          <span className={`rounded-full ${i < value ? "h-2.5 w-2.5 bg-blue-400" : "h-1.5 w-1.5 bg-gray-300"}`} />
        </button>
      ))}
    </span>
  );
}

/** Link-preview card (client-only: real per-site favicon + domain + URL, no
 *  server scrape). Favicon comes from Google's public s2 favicon service; falls
 *  back to a globe icon if it fails to load. */
function LinkCard({ url }: { url: string }) {
  const host = hostOf(url);
  const [imgOk, setImgOk] = useState(true);
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  const Fav = ({ size }: { size: string }) =>
    imgOk ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={favicon} alt="" className={size} onError={() => setImgOk(false)} />
    ) : (
      <Globe className={`${size} text-gray-400`} />
    );
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
      <div className="flex items-center gap-2">
        <Fav size="h-4 w-4" />
        <span className="text-sm font-medium text-blue-600">{titleOf(url)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-gray-500">{url}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
        <Fav size="h-3.5 w-3.5" /> {host}
      </div>
    </a>
  );
}

function InsightComposer({
  projectId, body, setBody, url, setUrl, impact, setImpact, labels, setLabels,
  labelDraft, setLabelDraft, addLabel, busy, onCreate, onCancel,
}: {
  projectId: string;
  body: string; setBody: (v: string) => void;
  url: string; setUrl: (v: string) => void;
  impact: number; setImpact: (v: number) => void;
  labels: string[]; setLabels: (v: string[]) => void;
  labelDraft: string; setLabelDraft: (v: string) => void;
  addLabel: () => void;
  busy: boolean;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Description box — the real working rich-text editor (matches JPD). */}
      <RichTextEditor
        value={body}
        onChange={setBody}
        placeholder="Add a description"
        uploadImage={(file) => uploadProjectImage(projectId, file)}
      />

      {/* Paste-a-link box */}
      <div className="relative">
        <LinkIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link"
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
        />
      </div>
      {url.trim() && <LinkCard url={url.trim()} />}

      <div className="flex flex-wrap items-center gap-6 text-xs text-gray-500">
        <span className="inline-flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5" /> Impact <ImpactPicker value={impact} onChange={setImpact} />
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" /> Labels
          {labels.length === 0 && !labelDraft && <span className="text-gray-400">None</span>}
          {labels.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
              {l}
              <button type="button" aria-label={`Remove ${l}`} onClick={() => setLabels(labels.filter((x) => x !== l))}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
            placeholder="+ Add"
            className="w-14 rounded border border-transparent px-1 py-0.5 text-[11px] text-blue-600 outline-none hover:border-gray-200 focus:border-blue-400"
          />
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" disabled={busy || !plainText(body)} onClick={onCreate} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}
