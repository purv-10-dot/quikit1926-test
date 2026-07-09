"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  List,
  Plus,
  Filter,
  ArrowUpDown,
  SlidersHorizontal,
  Upload,
  X,
  Info,
  MessageSquare,
} from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { IdeasTable, type Column } from "./ideas-table";
import { IdeaDetailPanel } from "./idea-detail-panel";
import type { IdeasBundle, IdeaRow } from "./ideas-types";

const VIEW_DESCRIPTION =
  "Centralize your ideas. This view has pre-configured fields helping you see the most common criteria of an idea — Theme, Impact, Effort, Roadmap and Score. You can change them and create your own fields to reflect your company framework.";

export function IdeasTableView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const queryKey = ["quiktrack", "ideas", projectId] as const;
  const { data, isLoading } = useApiData<IdeasBundle>(
    queryKey,
    `/api/projects/${projectId}/ideas`,
    { staleTime: 30_000 },
  );

  const [panelIdea, setPanelIdea] = useState<IdeaRow | null>(null);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const columns = useMemo<Column[]>(() => {
    if (!data) return [];
    const view = data.views.find((v) => v.isDefault) ?? data.views[0];
    const byKey = new Map(data.fields.map((f) => [f.key, f]));
    const keys = view?.config?.columns ?? ["summary", ...data.fields.map((f) => f.key)];
    return keys
      .map((key): Column | null => {
        if (key === "summary") return { key, label: "Summary" };
        const field = byKey.get(key);
        return field ? { key, label: field.name, field } : null;
      })
      .filter((c): c is Column => c !== null);
  }, [data]);

  async function createIdea() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNewTitle("");
        await qc.invalidateQueries({ queryKey });
      }
    } finally {
      setCreating(false);
    }
  }

  const ideaCount = data?.ideas.length ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title row */}
        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <List className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">All ideas</h2>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {ideaCount} {ideaCount === 1 ? "idea" : "ideas"}
          </span>
          {!aboutOpen && (
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="ml-1 truncate text-xs text-gray-500 hover:text-gray-700"
            >
              Centralize your ideas — you are in the “All ideas” view…
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 pb-2">
          <button
            type="button"
            onClick={() => document.getElementById("qt-idea-quickadd")?.focus()}
            className="inline-flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-accent-700"
          >
            <Plus className="h-3.5 w-3.5" /> Create
          </button>
          <ToolbarButton icon={Plus} label="Group by" />
          <ToolbarButton icon={Filter} label="Filter" />
          <ToolbarButton icon={ArrowUpDown} label="Sort" />
          <ToolbarButton icon={SlidersHorizontal} label={`Fields ${data?.fields.length ?? 0}`} />
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading ideas…</div>
          ) : (
            <>
              <IdeasTable columns={columns} ideas={data?.ideas ?? []} onOpen={setPanelIdea} />
              {/* Inline quick-add + CSV import footer */}
              <div className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="inline-flex items-center gap-1 text-gray-500">
                  <Plus className="h-3.5 w-3.5" />
                  <input
                    id="qt-idea-quickadd"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createIdea();
                    }}
                    disabled={creating}
                    placeholder="Create"
                    className="w-56 bg-transparent outline-none placeholder:text-gray-400"
                  />
                </div>
                <span className="text-gray-300">|</span>
                <button type="button" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700">
                  <Upload className="h-3.5 w-3.5" /> CSV Import
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* About / Comments side panel */}
      {aboutOpen && (
        <AboutPanel onClose={() => setAboutOpen(false)} />
      )}

      {panelIdea && data && (
        <IdeaDetailPanel
          projectId={projectId}
          idea={panelIdea}
          fields={data.fields}
          statuses={data.statuses}
          onClose={() => setPanelIdea(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label }: { icon: typeof Filter; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50"
    >
      <Icon className="h-3.5 w-3.5 text-gray-500" /> {label}
    </button>
  );
}

function AboutPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"about" | "comments">("about");
  return (
    <aside className="hidden w-80 flex-shrink-0 border-l border-gray-200 bg-white lg:block">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <List className="h-4 w-4 text-gray-500" /> All ideas
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 px-4">
        <TabPill active={tab === "about"} onClick={() => setTab("about")} icon={Info} label="About" />
        <TabPill active={tab === "comments"} onClick={() => setTab("comments")} icon={MessageSquare} label="Comments" />
      </div>
      <div className="px-4 py-4">
        {tab === "about" ? (
          <div>
            <h3 className="text-base font-semibold text-gray-900">Centralize your ideas</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{VIEW_DESCRIPTION}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center text-sm text-gray-500">
            <MessageSquare className="mb-2 h-8 w-8 text-gray-300" />
            Create comments to discuss, ask questions and share opinions about this view.
          </div>
        )}
      </div>
    </aside>
  );
}

function TabPill({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Info;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-sm ${
        active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
