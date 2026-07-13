"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ChevronDown,
  Plus,
  Link2,
  X,
  Settings,
  ExternalLink,
} from "lucide-react";

/**
 * Delivery tab for the idea detail panel (JPD). Links the idea to real work
 * items (QtIssues), which may live in OTHER spaces. Flows:
 *   • Link existing work — pick a space, search a work item, Add.
 *   • Create work item — pick a space, work type + summary, Create.
 * Below: a progress bar + a table of linked items (expandable children). Talks
 * to /api/projects/[id]/ideas/[ideaId]/delivery(/spaces|/search|/create|/[linkId]).
 */

interface Space { id: string; name: string; projectKey: string }
interface SearchItem { id: string; key: string; title: string; type: string; status: string | null }
interface Child { id: string; key: string; title: string; type: string; storyPoints: number | null; status: string | null; statusCategory: string | null }
interface LinkedItem {
  linkId: string; id: string; key: string; title: string; type: string;
  storyPoints: number | null; status: string | null; statusCategory: string | null;
  projectName: string | null; children: Child[];
}

const WORK_TYPES = ["EPIC", "TASK", "STORY", "FEATURE", "REQUEST", "BUG", "TEST"] as const;
const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function statusPill(cat: string | null): string {
  if (cat === "DONE") return "bg-green-100 text-green-700";
  if (cat === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

export function IdeaDelivery({
  projectId,
  ideaId,
  ideaTitle,
  onCountChange,
}: {
  projectId: string;
  ideaId: string;
  ideaTitle: string;
  onCountChange?: (n: number) => void;
}) {
  const base = `/api/projects/${projectId}/ideas/${ideaId}/delivery`;
  const [items, setItems] = useState<LinkedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(base);
      const json = (await res.json()) as { success: boolean; data?: { items: LinkedItem[]; progress: number } };
      if (json.success && json.data) {
        setItems(json.data.items);
        setProgress(json.data.progress);
        onCountChange?.(json.data.items.length);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ideaId]);

  async function unlink(linkId: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${linkId}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Action buttons when items already exist (JPD). */}
      {hasItems && mode === "idle" && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("link")} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Link2 className="h-3.5 w-3.5" /> Link a Jira work item
          </button>
          <button type="button" onClick={() => setMode("create")} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" /> Create work item
          </button>
        </div>
      )}

      {/* Link / Create forms */}
      {mode === "link" && (
        <LinkForm
          base={base}
          busy={busy} setBusy={setBusy}
          onDone={() => { setMode("idle"); void load(); }}
          onCancel={() => setMode("idle")}
        />
      )}
      {mode === "create" && (
        <CreateForm
          base={base}
          ideaTitle={ideaTitle}
          busy={busy} setBusy={setBusy}
          onDone={() => { setMode("idle"); void load(); }}
          onCancel={() => setMode("idle")}
        />
      )}

      {/* Empty state — the link/create picker sits open by default (JPD). */}
      {!loading && !hasItems && mode === "idle" && (
        <LinkForm
          base={base}
          busy={busy} setBusy={setBusy}
          onDone={() => void load()}
          showEmptyIllustration
          onCancel={() => undefined}
        />
      )}

      {/* Progress + linked table */}
      {hasItems && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Delivery</span>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
            <Settings className="h-4 w-4 text-gray-400" />
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Work item</th>
                  <th className="px-3 py-2 font-medium">Story points</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const open = expanded.has(it.id);
                  return (
                    <DeliveryRows
                      key={it.linkId}
                      it={it}
                      open={open}
                      onToggle={() => setExpanded((s) => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n; })}
                      onUnlink={() => void unlink(it.linkId)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
    </div>
  );
}

/** A linked top-level item row + (when expanded) its child rows. */
function DeliveryRows({ it, open, onToggle, onUnlink }: {
  it: LinkedItem; open: boolean; onToggle: () => void; onUnlink: () => void;
}) {
  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {it.children.length > 0 ? (
              <button type="button" onClick={onToggle} aria-label="Toggle children" className="text-gray-400 hover:text-gray-600">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
            ) : <span className="w-3.5" />}
            <span className="font-medium text-blue-600">{it.key}</span>
            <span className="truncate text-gray-800">{it.title}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-gray-600">{it.storyPoints ?? ""}</td>
        <td className="px-3 py-2">
          {it.status && <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusPill(it.statusCategory)}`}>{it.status.toUpperCase()}</span>}
        </td>
        <td className="px-2 py-2">
          <button type="button" aria-label="Unlink" onClick={onUnlink} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
      {open && (it.children.length > 0
        ? it.children.map((c) => (
            <tr key={c.id} className="border-t border-gray-100 bg-gray-50/40">
              <td className="px-3 py-2 pl-9">
                <span className="mr-1.5 font-medium text-blue-600">{c.key}</span>
                <span className="text-gray-700">{c.title}</span>
              </td>
              <td className="px-3 py-2 text-gray-600">{c.storyPoints ?? ""}</td>
              <td className="px-3 py-2">
                {c.status && <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusPill(c.statusCategory)}`}>{c.status.toUpperCase()}</span>}
              </td>
              <td />
            </tr>
          ))
        : (
          <tr className="border-t border-gray-100 bg-gray-50/40">
            <td colSpan={4} className="px-3 py-2 pl-9 text-xs text-gray-400">No child work items</td>
          </tr>
        ))}
    </>
  );
}

/** Shared space picker used by both link + create forms. */
function useSpaces(base: string) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${base}/spaces`).then((r) => r.json()).then((j: { success: boolean; data?: Space[] }) => {
      if (alive && j.success && j.data) setSpaces(j.data);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [base]);
  return spaces;
}

function SpaceSelect({ spaces, value, onChange }: { spaces: Space[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">Space</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Search for a space</option>
          {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

function LinkForm({ base, busy, setBusy, onDone, onCancel, showEmptyIllustration }: {
  base: string; busy: boolean; setBusy: (b: boolean) => void;
  onDone: () => void; onCancel: () => void; showEmptyIllustration?: boolean;
}) {
  const spaces = useSpaces(base);
  const [spaceId, setSpaceId] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [picked, setPicked] = useState<SearchItem | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!spaceId) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`${base}/search?spaceId=${encodeURIComponent(spaceId)}&q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { success: boolean; data?: SearchItem[] };
      if (json.success && json.data) setResults(json.data);
    }, 200);
  }, [base, spaceId, q]);

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: picked.id }),
      });
      if (res.ok) { setPicked(null); setQ(""); onDone(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Link existing work</p>
      <SpaceSelect spaces={spaces} value={spaceId} onChange={(v) => { setSpaceId(v); setPicked(null); }} />

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={picked ? `${picked.key} ${picked.title}` : q}
            onChange={(e) => { setPicked(null); setQ(e.target.value); }}
            disabled={!spaceId}
            placeholder="Search for a work item"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50"
          />
          {spaceId && !picked && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => setPicked(r)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium text-blue-600">{r.key}</span>
                  <span className="truncate text-gray-700">{r.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">You can’t search work items with the done status.</p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !picked} onClick={() => void add()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add
        </button>
        {!showEmptyIllustration && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        )}
      </div>

      {showEmptyIllustration && (
        <div className="pt-4 text-center">
          <p className="text-sm font-medium text-gray-700">Deliver the idea</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
            Create epics or link existing work. Here’s where you’ll be able to track delivery work related to this idea.
          </p>
          <a href="#" className="mt-2 inline-flex items-center gap-0.5 text-sm text-blue-600 hover:underline">
            Learn about delivery <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function CreateForm({ base, ideaTitle, busy, setBusy, onDone, onCancel }: {
  base: string; ideaTitle: string; busy: boolean; setBusy: (b: boolean) => void;
  onDone: () => void; onCancel: () => void;
}) {
  const spaces = useSpaces(base);
  const [spaceId, setSpaceId] = useState("");
  const [type, setType] = useState("");
  const [summary, setSummary] = useState(ideaTitle);
  const [embedIdea, setEmbedIdea] = useState(false);

  async function create() {
    if (!spaceId || !type || !summary.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, type, summary: summary.trim(), embedIdea }),
      });
      if (res.ok) onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Create Jira work item</p>
      <SpaceSelect spaces={spaces} value={spaceId} onChange={setSpaceId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Work type</label>
          <div className="relative">
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm outline-none focus:border-blue-400">
              <option value="">Select…</option>
              {WORK_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Summary</label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={embedIdea} onChange={(e) => setEmbedIdea(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        Embed the idea description and fields into the work item
      </label>

      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !spaceId || !type || !summary.trim()} onClick={() => void create()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}
