"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Star,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  Link2,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FilterToolbar, type ToolbarState, defaultToolbarStateFor } from "./filter-toolbar";
import { Pager, SkeletonRows } from "./filter-view-parts";
import { SaveFilterModal } from "./save-filter-modal";
import { BulkActionsBar, type BulkRow } from "./bulk-actions-bar";
import { useFilterPersistence } from "@/lib/hooks/usePersistentFilters";

interface IssueRow {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; projectKey: string } | null;
  status: { id: string; name: string; color: string; category: string } | null;
  assignee: UserLite | null;
  reporter: UserLite | null;
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
}

interface ApiResponse {
  success: boolean;
  data?: IssueRow[];
  total?: number;
  meta?: { title?: string; fallback?: string };
  error?: string;
}

/** Work-type icon + color, matching the board/modal type glyphs. */
const TYPE_ICON: Record<string, { Icon: LucideIcon; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: Link2, color: "text-blue-500" },
  IDEA: { Icon: Lightbulb, color: "text-amber-500" },
};
function typeIcon(type: string) {
  return TYPE_ICON[type] ?? TYPE_ICON.TASK;
}

const dateFmt: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function FilterView({ filterId }: { filterId: string }) {
  const [items, setItems] = useState<IssueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState("");
  const [fallback, setFallback] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [toolbar, setToolbar] = useState<ToolbarState>(() => defaultToolbarStateFor(filterId));
  const [saveOpen, setSaveOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  // Discovery ideas (type IDEA) live in a separate model with different bulk
  // endpoints, so they aren't bulk-selectable here — only real issues.
  const selectableItems = useMemo(() => items.filter((i) => i.type !== "IDEA" && i.project), [items]);
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOnPageSelected =
    selectableItems.length > 0 && selectableItems.every((i) => selectedIds.has(i.id));
  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) selectableItems.forEach((i) => next.delete(i.id));
      else selectableItems.forEach((i) => next.add(i.id));
      return next;
    });
  // Clear the selection when the filter or page changes (ids no longer visible).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterId, page]);

  const bulkRows: BulkRow[] = useMemo(
    () =>
      items
        .filter((i) => selectedIds.has(i.id) && i.project)
        .map((i) => ({
          id: i.id,
          key: i.key,
          title: i.title,
          type: i.type,
          projectId: i.project!.id,
          projectName: i.project!.name,
          statusId: i.status?.id ?? null,
        })),
    [items, selectedIds],
  );

  // A saved filter's id is prefixed `sf_`. It isn't a backend filter slug, so
  // its results query runs against the "all" base with the saved criteria
  // applied as toolbar params. `savedReady` gates the results fetch until the
  // criteria have been loaded (so we don't fetch unfiltered first).
  const isSaved = filterId.startsWith("sf_");
  const resultSlug = isSaved ? "all" : filterId;
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedReady, setSavedReady] = useState(!isSaved);

  // Reseed the toolbar state whenever the user switches between Default
  // filters in the sidebar — each slug carries its own implicit chips.
  useEffect(() => {
    if (!filterId.startsWith("sf_")) setToolbar(defaultToolbarStateFor(filterId));
  }, [filterId]);

  // Load a saved filter's criteria (name + toolbar + search) when viewing one.
  useEffect(() => {
    if (!isSaved) {
      setSavedReady(true);
      setSavedName(null);
      return;
    }
    let alive = true;
    setSavedReady(false);
    fetch(`/api/saved-filters/${filterId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.success) {
          setError(j?.error ?? "Filter not found");
          setSavedReady(true);
          return;
        }
        const criteria = (j.data?.criteria ?? {}) as ToolbarState & { search?: string };
        const { search: savedSearch, ...rest } = criteria;
        setSavedName(j.data?.name ?? "Saved filter");
        setToolbar({
          type: [],
          statusCategory: [],
          ...(rest as Partial<ToolbarState>),
        } as ToolbarState);
        const s = typeof savedSearch === "string" ? savedSearch : "";
        setSearch(s);
        setDebounced(s);
        setSavedReady(true);
      })
      .catch(() => {
        if (alive) {
          setError("Filter not found");
          setSavedReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [filterId, isSaved]);

  const toolbarQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (toolbar.projectId) qs.set("projectId", toolbar.projectId);
    if (toolbar.assignee) qs.set("assignee", toolbar.assignee);
    if (toolbar.reporter) qs.set("reporter", toolbar.reporter);
    if (toolbar.type.length) qs.set("type", toolbar.type.join(","));
    if (toolbar.statusCategory.length)
      qs.set("statusCategory", toolbar.statusCategory.join(","));
    if (toolbar.resolution) qs.set("resolution", toolbar.resolution);
    if (toolbar.customFilters?.length)
      qs.set("customFilters", JSON.stringify(toolbar.customFilters));
    return qs.toString();
  }, [toolbar]);

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-persist this default filter's toolbar + search, per user, per slug (no
  // project scope, no Save button). The page remounts per slug, so each gets
  // its own row.
  const persistedFilters = useMemo(
    () => ({ ...toolbar, search: debounced }),
    [toolbar, debounced],
  );
  useFilterPersistence<typeof persistedFilters>({
    viewKey: `global-${filterId}`,
    projectId: null,
    filters: persistedFilters,
    // Saved filters carry their own criteria (loaded above), so don't hydrate
    // from the per-slug view-pref — that would clobber the saved definition.
    skipHydrate: isSaved,
    applySaved: (s) => {
      const { search: savedSearch, ...rest } = s;
      setToolbar((prev) => ({ ...prev, ...(rest as Partial<ToolbarState>) }));
      if (typeof savedSearch === "string") {
        setSearch(savedSearch);
        setDebounced(savedSearch);
      }
    },
  });

  // Reset to page 1 whenever the filter, search, page size, or toolbar changes.
  useEffect(() => {
    setPage(1);
  }, [filterId, debounced, pageSize, toolbarQs]);

  useEffect(() => {
    if (!savedReady) return; // wait for saved criteria before the first fetch
    let alive = true;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(toolbarQs);
    if (debounced) qs.set("search", debounced);
    qs.set("limit", String(pageSize));
    qs.set("offset", String((page - 1) * pageSize));
    fetch(`/api/filters/${resultSlug}?${qs}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((j) => {
        if (!alive) return;
        if (!j.success) {
          setError(j.error ?? "Failed to load");
          return;
        }
        setItems(j.data ?? []);
        setTotal(j.total ?? 0);
        setTitle(savedName ?? j.meta?.title ?? "Work items");
        setFallback(j.meta?.fallback);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [resultSlug, savedReady, savedName, debounced, page, pageSize, toolbarQs, refreshKey]);

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <Star className="h-5 w-5 text-gray-300 hover:text-yellow-400 cursor-pointer" />
      </div>

      {saveOpen && (
        <SaveFilterModal
          criteria={{ ...toolbar, search: debounced }}
          onClose={() => setSaveOpen(false)}
          onSaved={(saved) => {
            setSaveOpen(false);
            router.push(`/filters/${saved.id}`);
          }}
        />
      )}

      {fallback && (
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{fallback}</span>
        </div>
      )}

      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        onClear={() => {
          setSearch("");
          setToolbar(defaultToolbarStateFor(filterId));
        }}
        state={toolbar}
        onChange={setToolbar}
        onSaveFilter={() => setSaveOpen(true)}
      />

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  disabled={selectableItems.length === 0}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                />
              </th>
              <th className="px-3 py-2.5 w-[32%]">Work</th>
              <th className="px-3 py-2.5 w-[12%]">Assignee</th>
              <th className="px-3 py-2.5 w-[12%]">Reporter</th>
              <th className="px-3 py-2.5 w-[8%]">Priority</th>
              <th className="px-3 py-2.5 w-[12%]">Status</th>
              <th className="px-3 py-2.5 w-[10%]">Created</th>
              <th className="px-3 py-2.5 w-[10%]">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && items.length === 0 ? (
              <SkeletonRows rows={Math.min(pageSize, 8)} />
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-red-600 text-sm">
                  {error}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No work items match this filter.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const selectable = it.type !== "IDEA" && !!it.project;
                return (
                <tr key={it.id} className={`hover:bg-gray-50 ${selectedIds.has(it.id) ? "bg-blue-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${it.key}`}
                      checked={selectedIds.has(it.id)}
                      onChange={() => toggleRow(it.id)}
                      disabled={!selectable}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => {
                        const T = typeIcon(it.type);
                        return <T.Icon className={`h-4 w-4 shrink-0 ${T.color}`} />;
                      })()}
                      {it.project ? (
                        <Link
                          href={
                            it.type === "IDEA"
                              ? `/spaces/${it.project.id}/ideas`
                              : `/spaces/${it.project.id}/work/${it.id}`
                          }
                          className="text-blue-600 hover:underline font-medium shrink-0"
                        >
                          {it.key}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-700 shrink-0">{it.key}</span>
                      )}
                      <span className="text-gray-700 truncate">{it.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <UserCell user={it.assignee} />
                  </td>
                  <td className="px-3 py-2">
                    <UserCell user={it.reporter} />
                  </td>
                  <td className="px-3 py-2 text-gray-700 capitalize">
                    {it.priority.toLowerCase()}
                  </td>
                  <td className="px-3 py-2">
                    {it.status ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide"
                        style={{
                          background: `${it.status.color}1f`,
                          color: it.status.color,
                          border: `1px solid ${it.status.color}55`,
                        }}
                      >
                        {it.status.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {new Date(it.createdAt).toLocaleString(undefined, dateFmt)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {new Date(it.updatedAt).toLocaleString(undefined, dateFmt)}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BulkActionsBar
        rows={bulkRows}
        onSelectAll={toggleAllOnPage}
        onClear={() => setSelectedIds(new Set())}
        onDone={() => {
          setSelectedIds(new Set());
          setRefreshKey((k) => k + 1); // re-run the results fetch
        }}
      />

      <Pager
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        rowCount={items.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function UserCell({ user }: { user: UserLite | null }) {
  if (!user) return <span className="text-gray-400">Unassigned</span>;
  const initial = (user.firstName?.[0] ?? user.email[0] ?? "?").toUpperCase();
  return (
    <div className="flex items-center gap-2 min-w-0">
      {user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt="" className="h-6 w-6 rounded-full shrink-0" />
      ) : (
        <span className="h-6 w-6 shrink-0 rounded-full bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center">
          {initial}
        </span>
      )}
      <span className="text-gray-700 truncate">
        {user.firstName} {user.lastName}
      </span>
    </div>
  );
}
