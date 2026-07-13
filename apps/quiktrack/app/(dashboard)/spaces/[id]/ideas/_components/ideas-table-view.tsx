"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Filter,
  ArrowUpDown,
  SlidersHorizontal,
  Upload,
  Search,
  UserPlus,
  MessageSquare,
  Share2,
  Lock,
  MoreHorizontal,
  Maximize2,
} from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { IdeasTable, type Column } from "./ideas-table";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { SPECIAL_COLUMNS, type IdeasBundle, type IdeaRow, type IdeaFieldValue } from "./ideas-types";

const VIEW_DESCRIPTION =
  "Centralize your ideas. You are in the “All ideas” view, which stores all ideas in this project.";

export function IdeasTableView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const queryKey = ["quiktrack", "ideas", projectId] as const;
  const { data, isLoading } = useApiData<IdeasBundle>(
    queryKey,
    `/api/projects/${projectId}/ideas`,
    { staleTime: 30_000 },
  );

  const [rows, setRows] = useState<IdeaRow[]>([]);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const openAddRef = useRef<(() => void) | null>(null);

  useEffect(() => { if (data) setRows(data.ideas); }, [data]);
  // Default the active (green-accent) row to the first idea, like JPD.
  useEffect(() => { if (!activeId && rows.length) setActiveId(rows[0].id); }, [rows, activeId]);

  const columns = useMemo<Column[]>(() => {
    if (!data) return [];
    const view = data.views.find((v) => v.isDefault) ?? data.views[0];
    const byKey = new Map(data.fields.map((f) => [f.key, f]));
    const keys = view?.config?.columns ?? ["summary", ...data.fields.map((f) => f.key)];
    return keys
      .map((key): Column | null => {
        if (SPECIAL_COLUMNS[key]) return { key, label: SPECIAL_COLUMNS[key] };
        const field = byKey.get(key);
        return field ? { key, label: field.name, field } : null;
      })
      .filter((c): c is Column => c !== null);
  }, [data]);

  async function patchIdeaRaw(ideaId: string, body: Record<string, unknown>) {
    await fetch(`/api/projects/${projectId}/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function patchIdea(ideaId: string, body: Record<string, unknown>) {
    await patchIdeaRaw(ideaId, body);
    await qc.invalidateQueries({ queryKey });
  }

  function onEdit(ideaId: string, fieldId: string, value: IdeaFieldValue) {
    setRows((rs) => rs.map((r) => (r.id === ideaId ? { ...r, values: { ...r.values, [fieldId]: value } } : r)));
    void patchIdea(ideaId, { values: { [fieldId]: value } });
  }

  function onEditTitle(ideaId: string, title: string) {
    setRows((rs) => rs.map((r) => (r.id === ideaId ? { ...r, title } : r)));
    void patchIdea(ideaId, { title });
  }

  // Drag-and-drop reorder: move `fromId` to `toId`'s slot, renumber locally, then
  // persist each affected row's new orderIndex (JPD reorders the whole list).
  function onReorder(fromId: string, toId: string) {
    const from = rows.findIndex((r) => r.id === fromId);
    const to = rows.findIndex((r) => r.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const renumbered = next.map((r, i) => ({ ...r, orderIndex: i }));
    setRows(renumbered);
    // Persist only the rows whose index actually changed (the moved span), then
    // invalidate ONCE so we don't fire a refetch per row.
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const writes: Promise<void>[] = [];
    for (let i = lo; i <= hi; i++) {
      writes.push(patchIdeaRaw(renumbered[i].id, { orderIndex: i }));
    }
    void Promise.all(writes).then(() => qc.invalidateQueries({ queryKey }));
  }

  async function createIdeaWithTitle(rawTitle: string) {
    const title = rawTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) await qc.invalidateQueries({ queryKey });
    } finally {
      setCreating(false);
    }
  }

  const visible = search
    ? rows.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
    : rows;
  const panelIdea = rows.find((r) => r.id === panelId) ?? null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 px-6 pt-4 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-2xl">👋</span>
            <h2 className="text-2xl font-semibold text-gray-900">All ideas</h2>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {rows.length} {rows.length === 1 ? "idea" : "ideas"}
            </span>
            <span className="ml-1 hidden truncate text-xs text-gray-500 md:inline">{VIEW_DESCRIPTION}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 text-gray-500">
            <ChromeIcon icon={UserPlus} label="Add people" />
            <ChromeIcon icon={MessageSquare} label="Comments" />
            <button type="button" className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <ChromeIcon icon={Lock} label="Lock view" />
            <ChromeIcon icon={MoreHorizontal} label="More" />
            <ChromeIcon icon={Maximize2} label="Fullscreen" />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-6 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAddRef.current?.()}
              className="inline-flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-accent-700"
            >
              Create
            </button>
            <ToolbarButton icon={Plus} label="Group by" />
            <ToolbarButton icon={Filter} label="Filter" />
            <ToolbarButton icon={ArrowUpDown} label="Sort" />
            <ToolbarButton icon={SlidersHorizontal} label={`Fields ${columns.length}`} />
            <button type="button" aria-label="View settings" className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find an idea in this view"
              className="w-56 rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Table — left-inset to line up with the toolbar; right-flush to the
            edge (no right padding) so the grid runs to the edge like JPD. */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-4 pl-6">
          {isLoading ? (
            <div className="py-6 text-sm text-gray-500">Loading ideas…</div>
          ) : (
            <>
              <IdeasTable
                columns={columns}
                ideas={visible}
                activeId={activeId}
                onSetActive={setActiveId}
                onOpen={(i) => { setActiveId(i.id); setPanelId(i.id); }}
                onEdit={onEdit}
                onEditTitle={onEditTitle}
                onReorder={onReorder}
                onCreate={createIdeaWithTitle}
                creating={creating}
                openAddRef={openAddRef}
                footer={(openAdd) => (
                  <div className="flex items-center gap-3 border-t border-gray-200 px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={openAdd}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create
                    </button>
                    <span className="text-gray-300">|</span>
                    <button type="button" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700">
                      <Upload className="h-3.5 w-3.5" /> CSV Import
                    </button>
                  </div>
                )}
              />
            </>
          )}
        </div>
      </div>

      {panelIdea && data && (
        <IdeaDetailPanel
          projectId={projectId}
          idea={panelIdea}
          fields={data.fields}
          statuses={data.statuses}
          onClose={() => setPanelId(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label }: { icon: typeof Filter; label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50">
      <Icon className="h-3.5 w-3.5 text-gray-500" /> {label}
    </button>
  );
}

function ChromeIcon({ icon: Icon, label }: { icon: typeof Filter; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className="rounded p-1.5 hover:bg-gray-100">
      <Icon className="h-4 w-4 text-gray-500" />
    </button>
  );
}
