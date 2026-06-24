"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useWWWItemsPaginated, useDeleteWWW, useBulkRestoreWWW, type WWWFilters } from "@/lib/hooks/useWWW";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { WWWTable } from "./components/WWWTable";
import { WWWPanel } from "./components/WWWPanel";
import { FilterPicker, userToFilterOption, EmptyState, type ExportSelection } from "@quikit/ui";
import { useFilterContext } from "@/lib/context/FilterContext";
import { STATUS_FILTER_OPTIONS } from "@/lib/constants/status";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { useTableSort, useDebouncedTableSearch } from "@/lib/store";
import { AddButton } from "@quikit/ui";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { Trophy } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { runExport } from "@/lib/export/xlsx";
import { notify } from "@/lib/utils/notify";

export default function WWWPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("WWW");
  // Search is debounced + persisted via the shared tables slice (lib/store).
  // `searchInput` is the controlled input value; `search` is the debounced
  // value the filter logic below reads from.
  const [searchInput, setSearchInput, search] = useDebouncedTableSearch("www");
  // WWW only honours the OWNER filter from the global context (no team scope
  // ever bleeds in — per product rule). The owner ("who") is seeded from context
  // on mount AND written back on change/clear, so it stays in sync with
  // Dashboard / KPI / Priority. The status filter is WWW-only but persists for
  // the browser-tab session (survives navigation + refresh).
  const ctx = useFilterContext();
  const [filterWho, setFilterWho] = useState<string>(ctx.filterOwner);
  const [filterTeam, setFilterTeam] = useState("");
  const [filterStatus, setFilterStatus] = useSessionState<string>("qs:www:status", "");
  const [showFilter, setShowFilter] = useState(false);

  // Teams list
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch("/api/org/teams").then(r => r.json()).then(d => {
      if (d.success) setTeams(d.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    });
  }, []);

  // Owner ("Who") dropdown — DB-level infinite (25/page) + server search.
  const [ownerSearch, setOwnerSearch] = useState("");
  const {
    users,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(filterTeam || undefined, ownerSearch);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filterRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedIds(new Set(ids)), []);

  // Hidden cols come from the DB-backed user pref. Sort lives in the shared
  // Redux tables slice (lib/store) — same pattern as KPI + Priority.
  const wwwPrefs = useTablePrefs("www");
  const { hiddenCols: wwwHidden } = wwwPrefs;
  const { sortBy: wwwSortBy, sortOrder: wwwSortOrder } = useTableSort("www");
  const wwwSort = wwwSortBy ? `${wwwSortBy}:${wwwSortOrder}` : null;

  const WWW_COL_LABELS: Record<string, string> = {
    who: "Who", when: "When", what: "What", revisedDate: "Revised Date", status: "Status", notes: "Notes",
    // Audit columns — populated by GET /api/www via decorateAudit.
    createdBy: "Created By", updatedBy: "Updated By",
    createdAt: "Created Date", updatedAt: "Updated Date",
  };
  const wwwColumns = Object.entries(WWW_COL_LABELS).map(([key, label]) => ({ key, label }));
  const visibleWwwCols = wwwColumns.filter((c) => !wwwHidden.includes(c.key)).map((c) => c.key);

  // View Trash toggle
  const [viewTrash, setViewTrash] = useState(false);

  // Pagination state — default 10 rows per page; selectable 10/20/30/50.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // DB-level list: pagination + search + who/team/status filters all run in
  // the route now. `search` is the debounced value from the shared store.
  const listFilters: WWWFilters = {
    status: filterStatus || undefined,
    sort: wwwSort,
    includeDeleted: viewTrash,
    page,
    limit: pageSize,
    search: search.trim() || undefined,
    who: filterWho || undefined,
    teamId: filterTeam || undefined,
  };
  const { data: pageData, isLoading, error, refetch } = useWWWItemsPaginated(listFilters);
  const items = useMemo(() => pageData?.data ?? [], [pageData]);
  const total = pageData?.meta.total ?? 0;

  const deleteWWW = useDeleteWWW();
  const bulkRestoreWWW = useBulkRestoreWWW();

  // Close filter dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    try {
      await Promise.all([...selectedIds].map(id => deleteWWW.mutateAsync(id)));
      notify.success(`Deleted ${count} action item${count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      notify.error(err, { context: "action item", fallback: "Couldn't delete the selected action items. Please try again." });
    }
  }

  async function handleBulkRestore() {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    try {
      await bulkRestoreWWW.mutateAsync([...selectedIds]);
      notify.success(`Restored ${count} action item${count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      notify.error(err, { context: "action item", fallback: "Couldn't restore the selected action items. Please try again." });
    }
  }

  // Reset to page 1 whenever a filter/search/sort changes the result set.
  useEffect(() => { setPage(1); }, [filterWho, filterTeam, filterStatus, search, viewTrash, pageSize, wwwSort]);

  const activeFilterCount = (filterTeam ? 1 : 0) + (filterStatus ? 1 : 0) + (filterWho ? 1 : 0);

  const handleWwwExport = useCallback(async (sel: ExportSelection) => {
    const columns = wwwColumns
      .filter((c) => sel.columnKeys.includes(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: (i: any) => {
          switch (c.key) {
            case "who": return i.who_user ? `${i.who_user.firstName} ${i.who_user.lastName}` : "";
            case "when": return i.when ? new Date(i.when).toISOString().slice(0, 10) : "";
            case "what": return i.what ?? "";
            case "revisedDate": {
              const arr = Array.isArray(i.revisedDates) ? i.revisedDates : [];
              return arr.length ? new Date(arr[arr.length - 1]).toISOString().slice(0, 10) : "";
            }
            case "status": return i.status ?? "";
            case "notes": return i.notes ?? "";
            default: return "";
          }
        },
      }));
    await runExport<any>({
      selection: sel,
      columns,
      pageRows: items,
      fetchFiltered: async () => items as any[],
      fetchAll: async () => items as any[],
      filename: `WWW${viewTrash ? "-Trash" : ""}`,
      sheetName: "WWW",
    });
  }, [wwwColumns, items, viewTrash]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">WWW</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {total} {total === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete — active list only */}
          {canDelete && selectedIds.size > 0 && !viewTrash && (
            <button
              onClick={handleBulkDelete}
              disabled={deleteWWW.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {deleteWWW.isPending ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Delete {selectedIds.size} selected
            </button>
          )}

          {/* Bulk restore — trash view only */}
          {canDelete && selectedIds.size > 0 && viewTrash && (
            <button
              onClick={handleBulkRestore}
              disabled={bulkRestoreWWW.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {bulkRestoreWWW.isPending ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6-6m-6 6l6 6" />
                </svg>
              )}
              Restore {selectedIds.size} selected
            </button>
          )}

          {viewTrash && (
            <button
              type="button"
              onClick={() => setViewTrash(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-50 border border-amber-200 text-amber-900 rounded-md hover:bg-amber-100 transition-colors"
              title="Exit trash view"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Viewing deleted ({total})
              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>

          {/* Filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : "Filter"}
            </button>

            {showFilter && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
                  <FilterPicker
                    value={filterTeam}
                    onChange={setFilterTeam}
                    options={teams.map(t => ({ value: t.id, label: t.name }))}
                    allLabel="All teams"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Who</p>
                  <FilterPicker
                    value={filterWho}
                    onChange={(v) => { setFilterWho(v); ctx.setFilterOwner(v); }}
                    options={users.map(userToFilterOption)}
                    onSearchChange={setOwnerSearch}
                    onLoadMore={fetchMoreOwners}
                    hasMore={ownersHasMore}
                    loadingMore={ownersLoadingMore}
                    loading={ownersLoading}
                    allLabel="All people"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                  >
                    {STATUS_FILTER_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {(filterTeam || filterStatus || filterWho) && (
                  <button
                    onClick={() => { setFilterTeam(""); setFilterStatus(""); setFilterWho(""); ctx.setFilterOwner(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          <ModuleMoreActions
            columns={wwwColumns}
            hiddenCols={wwwHidden}
            onHiddenColsChange={(next) => wwwPrefs.setHiddenCols(next)}
            isTrashActive={viewTrash}
            onToggleTrash={setViewTrash}
            rowCounts={{ page: items.length, filtered: total, all: total }}
            onExport={handleWwwExport}
            defaultExportColumnKeys={visibleWwwCols}
          />

          {canCreate && <AddButton onClick={() => setShowAddModal(true)}>Add WWW</AddButton>}
        </div>
      </div>

      {/* Table Area — `min-h-0` required so flex-1 actually shrinks to viewport
          height; without it the inner scroller inherits content height and
          vertical scroll silently breaks. */}
      <div className="flex-1 overflow-hidden min-h-0">
        {isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">
            Failed to load WWW items
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Trophy}
              title="Log your first win"
              message="WWW (Who Will do What by When) captures commitments made in meetings. Track who owns what, when it's due, and whether it landed."
              action={canCreate ? { label: "Add your first WWW", onClick: () => setShowAddModal(true) } : undefined}
            />
          </div>
        ) : (
          <WWWTable
            items={items}
            onRefresh={refetch}
            onSelectionChange={handleSelectionChange}
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            canDelete={canDelete}
            canUpdate={canUpdate}
          />
        )}
      </div>

      {/* Add New Panel */}
      {showAddModal && (
        <WWWPanel
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refetch(); }}
        />
      )}
    </div>
  );
}
