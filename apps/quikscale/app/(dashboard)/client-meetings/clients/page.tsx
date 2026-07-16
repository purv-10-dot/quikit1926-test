"use client";

/**
 * Client Master — flat CRUD. Layout mirrors Individual KPI exactly: single
 * header row with pills + controls, dense table body, right-docked drawer.
 *
 * Admin-only create/edit/delete. Soft-delete + trash mode + manage cols +
 * export (shared `ModuleMoreActions`). Filter popover narrows by Client and
 * Active/Inactive status.
 *
 * Add/Edit form (image 1): Team Members (multi from ClientMember),
 * Client Name, D/H window, Weekly window, Is Client Active, Description.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFilterContext } from "@/lib/context/FilterContext";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import { useInfiniteClientMembers } from "@/lib/hooks/useInfiniteClientMembers";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton,
  AddButton, EmptyState,
  Segmented, FilterPicker, UserMultiPicker, Pagination, type ExportSelection, type PickerUser,
} from "@quikit/ui";
import { Users, History, Clock, Search, Filter, Trash2, RotateCcw } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort, useDebouncedTableSearch } from "@/lib/store";
import { useColumnResize } from "@/lib/hooks/useColumnResize";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { moveByKey, columnsUnfrozenBy } from "@/lib/utils/columnOrder";
import { useColumnDnD } from "@/lib/hooks/useColumnDnD";
import { useRowDnD } from "@/lib/hooks/useRowDnD";
import { rowNeighbors } from "@/lib/utils/rowOrder";
import { useStickyOffsets } from "@/lib/hooks/useStickyOffsets";
import { HeaderCell } from "@/components/table/HeaderCell";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { useConfirm } from "@quikit/ui";

// Client Master column layout. Rail cols are never reorderable; the rest are
// user-draggable + persisted per user via useColumnOrder("clientMaster").
const CLIENT_RAIL_COLS = ["_checkbox", "_log", "_id"] as const;
const CLIENT_DEFAULT_NON_RAIL = [
  "name", "teamMembers", "dailyWindow", "weeklyWindow",
  "isActive", "description",
  "createdBy", "updatedBy", "createdAt", "updatedAt",
];
// Header metadata for the draggable columns (label + sort config).
const CLIENT_HEADER_META: Record<string, { label: string; sortable?: boolean; sortKey?: string }> = {
  name: { label: "Client Name", sortable: true },
  teamMembers: { label: "Team Members" },
  dailyWindow: { label: "D/H Window", sortable: true, sortKey: "dailyStartTime" },
  weeklyWindow: { label: "Weekly Window", sortable: true, sortKey: "weeklyStartTime" },
  isActive: { label: "Status", sortable: true },
  description: { label: "Description" },
  createdBy: { label: "Created By" },
  updatedBy: { label: "Updated By" },
  createdAt: { label: "Created Date", sortable: true },
  updatedAt: { label: "Updated Date", sortable: true },
};

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  name: 220,
  teamMembers: 280,
  dailyWindow: 130,
  weeklyWindow: 130,
  isActive: 90,
  description: 240,
  createdBy: 160,
  updatedBy: 160,
  createdAt: 120,
  updatedAt: 120,
};
import { notify } from "@/lib/utils/notify";
import { runExport } from "@/lib/export/xlsx";
import { ClientChangeHistoryPanel } from "./ClientChangeHistoryPanel";

interface ClientRow {
  id: string;
  displayId: number;
  name: string;
  description: string | null;
  isActive: boolean;
  weeklyStartTime: string | null; weeklyEndTime: string | null;
  dailyStartTime: string | null;  dailyEndTime: string | null;
  teamMembers: Array<{ id: string; name: string; email: string }>;
  createdAt: string; updatedAt: string;
  createdBy: string; createdByName: string; createdByInitials: string;
  updatedBy: string | null;
  updatedByName: string | null; updatedByInitials: string | null;
}

interface MemberOption { id: string; name: string; email: string }

const emptyForm = {
  name: "", description: "", isActive: true as boolean,
  weeklyStartTime: "", weeklyEndTime: "",
  dailyStartTime: "",  dailyEndTime: "",
  teamMemberIds: [] as string[],
};

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtWindow(s: string | null, e: string | null) {
  if (s && e) return `${s} – ${e}`;
  return "—";
}

export default function ClientsPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("ClientMaster");

  const { quarter } = useFilterContext();
  const { year } = useFilterContext();
  const currentWeek = useCurrentWeek(year, quarter);

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  // All clients (id+name only) for the filter dropdown — fetched once so the
  // dropdown stays complete even though `rows` is now a single server page.
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  // Team-member multi-select (editing a client's roster) — DB-level infinite
  // (25/page) + server search, instead of loading every client-member.
  const [memberSearch, setMemberSearch] = useState("");
  const {
    members: memberOptions,
    isLoading: membersLoading,
    hasNextPage: membersHasMore,
    isFetchingNextPage: membersLoadingMore,
    fetchNextPage: fetchMoreMembers,
  } = useInfiniteClientMembers(undefined, memberSearch);
  // Selected members' objects for the editing client's roster — seeds the
  // multi-select chips so they persist across the paginated option slices.
  const [editSeedMembers, setEditSeedMembers] = useState<PickerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput, search] = useDebouncedTableSearch("clientMaster");
  const [viewTrash, setViewTrash] = useState(false);

  // Pagination — default 10 rows, options 10/20/30/50.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter popover — Client name + Status.
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");

  // Server-persisted column preferences (frozen / hidden / sort) via the
  // UserTablePreference table in app_quikscale. Same shape as KPI / Priority /
  // WWW — see lib/hooks/useTablePreferences.ts.
  const {
    hiddenCols,
    setHiddenCols,
    frozenCol: frozenUpTo,
    setFrozenCol,
    hideCol,
  } = useTablePrefs("clientMaster");
  const { sortBy, sortOrder, setSort } = useTableSort("clientMaster");
  const { getColWidth, startResize, colWidths } = useColumnResize("clientMaster", COL_WIDTHS_DEFAULT);

  // Cascade-freeze infrastructure — mirrors KPI/Weekly Meeting/Daily Huddle.
  // Freezing column C pins every column from the always-frozen left rail
  // (`_checkbox`/`_log`/`_id`, total 152px) up to and including C as a
  // sticky group. Offsets are measured from the live DOM by
  // `useStickyOffsets` so they always match the actual layout.
  // Per-user drag-and-drop order of the non-rail columns.
  const {
    orderedCols: orderedNonRail,
    applyOrder: applyColumnOrder,
  } = useColumnOrder("clientMaster", CLIENT_DEFAULT_NON_RAIL, { alwaysFrozen: CLIENT_RAIL_COLS });
  const COL_ORDER = useMemo(
    () => [...CLIENT_RAIL_COLS, ...orderedNonRail],
    [orderedNonRail],
  );
  const hiddenSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  // Seed sticky offsets from colWidths so the first paint already positions
  // frozen cells correctly. DOM measurement still takes over after layout.
  const stickyFallback = useMemo(
    () => ({
      colOrder: COL_ORDER,
      railWidths: { _checkbox: 40, _log: 56, _id: 56 } as const,
      getColWidth,
    }),
    [COL_ORDER, getColWidth],
  );
  const { getStickyLeft } = useStickyOffsets(
    headerRowRef,
    frozenUpTo,
    hiddenSet,
    colWidths,
    stickyFallback,
  );
  const isFrozen = useCallback(
    (col: string): boolean => {
      if (!frozenUpTo) return false;
      const i = COL_ORDER.indexOf(col);
      const j = COL_ORDER.indexOf(frozenUpTo);
      return i !== -1 && j !== -1 && i <= j;
    },
    [frozenUpTo, COL_ORDER],
  );
  const handleFreeze = useCallback(
    (col: string) => setFrozenCol(frozenUpTo === col ? null : col),
    [frozenUpTo, setFrozenCol],
  );

  // ── Drag-to-reorder columns ─────────────────────────────────────────────
  const confirmDialog = useConfirm();
  const handleColDrop = useCallback(
    async (fromKey: string, toKey: string, side: "before" | "after") => {
      const nextNonRail = moveByKey(orderedNonRail, fromKey, toKey, side);
      const nextFull = [...CLIENT_RAIL_COLS, ...nextNonRail];
      const curFull = [...CLIENT_RAIL_COLS, ...orderedNonRail];
      const unfrozen = columnsUnfrozenBy(curFull, nextFull, frozenUpTo, CLIENT_RAIL_COLS);
      if (unfrozen.length > 0) {
        const ok = await confirmDialog({
          tone: "warning",
          title: "Unfreeze column?",
          description:
            "Moving this column will remove it from the frozen (pinned) section. Are you sure you want to continue?",
          confirmLabel: "Yes, move it",
          cancelLabel: "No",
        });
        if (!ok) return;
      }
      applyColumnOrder(nextNonRail);
    },
    [orderedNonRail, frozenUpTo, applyColumnOrder, confirmDialog],
  );
  const dnd = useColumnDnD({
    getHeaderRow: () => headerRowRef.current,
    onDrop: handleColDrop,
    canReorder: (col) => orderedNonRail.includes(col),
  });
  const dropIndicatorClass = useCallback(
    (col: string) => {
      if (dnd.overKey !== col || !dnd.dropSide) return "";
      return dnd.dropSide === "before"
        ? "shadow-[inset_2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500"
        : "shadow-[inset_-2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500";
    },
    [dnd.overKey, dnd.dropSide],
  );
  function tdFreezeClass(k: string): string {
    return isFrozen(k) ? "sticky z-[10] bg-white" : "";
  }
  function freezeStyle(k: string): React.CSSProperties {
    const w = getColWidth(k);
    if (isFrozen(k)) return { width: w, minWidth: w, left: getStickyLeft(k) };
    return { width: w };
  }
  const isHidden = (k: string) => hiddenCols.includes(k);

  // Adapter that binds local table state to the shared <HeaderCell>. Each
  // `<Header k="…" label="…" sortable sortKey="…" />` renders one column
  // header (sort arrow + ColMenu + resize handle + freeze icon when boundary).
  const Header = (props: {
    k: string;
    label: string;
    sortable?: boolean;
    sortKey?: string;
  }) => (
    <HeaderCell
      {...props}
      isHidden={isHidden}
      getColWidth={getColWidth}
      startResize={startResize}
      hideCol={hideCol}
      sortBy={sortBy}
      sortOrder={sortOrder}
      setSort={setSort}
      isFrozen={isFrozen}
      getStickyLeft={getStickyLeft}
      frozenUpTo={frozenUpTo}
      onFreeze={handleFreeze}
      thClassName="group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200"
      onDragStart={(e) => dnd.startDrag(props.k, e)}
      dropIndicatorClass={dropIndicatorClass(props.k)}
      isDragging={dnd.draggingKey === props.k}
    />
  );

  // Render one draggable client column body cell by key. Styling is unchanged
  // from the previous hardcoded blocks.
  const renderClientCell = (r: ClientRow, k: string) => {
    if (isHidden(k)) return null;
    switch (k) {
      case "name":
        return (
          <td key={k} style={freezeStyle("name")} className={`px-3 py-3 font-medium text-gray-800 overflow-hidden text-ellipsis whitespace-nowrap ${tdFreezeClass("name")}`}>
            {r.name}
          </td>
        );
      case "teamMembers":
        return (
          <td key={k} style={freezeStyle("teamMembers")} className={`px-3 py-3 text-gray-600 overflow-hidden ${tdFreezeClass("teamMembers")}`}>
            {r.teamMembers.length === 0 ? <span className="text-gray-300">—</span> : (
              <span title={r.teamMembers.map(m => m.name).join(", ")} className="whitespace-nowrap text-ellipsis overflow-hidden block">
                {r.teamMembers.slice(0, 3).map(m => m.name).join(", ")}
                {r.teamMembers.length > 3 && ` +${r.teamMembers.length - 3}`}
              </span>
            )}
          </td>
        );
      case "dailyWindow":
        return (
          <td key={k} style={freezeStyle("dailyWindow")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("dailyWindow")}`}>
            {fmtWindow(r.dailyStartTime, r.dailyEndTime)}
          </td>
        );
      case "weeklyWindow":
        return (
          <td key={k} style={freezeStyle("weeklyWindow")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("weeklyWindow")}`}>
            {fmtWindow(r.weeklyStartTime, r.weeklyEndTime)}
          </td>
        );
      case "isActive":
        return (
          <td key={k} style={freezeStyle("isActive")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("isActive")}`}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {r.isActive ? "Active" : "Inactive"}
            </span>
          </td>
        );
      case "description":
        return (
          <td key={k} style={freezeStyle("description")} className={`px-3 py-3 text-gray-600 truncate ${tdFreezeClass("description")}`} title={r.description ?? ""}>
            {r.description ?? <span className="text-gray-300">—</span>}
          </td>
        );
      case "createdBy":
        return (
          <td key={k} style={freezeStyle("createdBy")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("createdBy")}`}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                {r.createdByInitials}
              </span>
              <span className="text-xs text-gray-700 whitespace-nowrap text-ellipsis overflow-hidden">{r.createdByName}</span>
            </div>
          </td>
        );
      case "updatedBy":
        return (
          <td key={k} style={freezeStyle("updatedBy")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("updatedBy")}`}>
            {r.updatedByName ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                  {r.updatedByInitials}
                </span>
                <span className="text-xs text-gray-700 whitespace-nowrap text-ellipsis overflow-hidden">{r.updatedByName}</span>
              </div>
            ) : <span className="text-gray-300">—</span>}
          </td>
        );
      case "createdAt":
        return (
          <td key={k} style={freezeStyle("createdAt")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("createdAt")}`}>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3 text-gray-400" /> {fmtDateShort(r.createdAt)}</span>
          </td>
        );
      case "updatedAt":
        return (
          <td key={k} style={freezeStyle("updatedAt")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("updatedAt")}`}>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3 text-gray-400" /> {fmtDateShort(r.updatedAt)}</span>
          </td>
        );
      default:
        return null;
    }
  };

  const [editing, setEditing] = useState<{ id: string | null; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logOpen, setLogOpen] = useState<ClientRow | null>(null);
  // Resolve team-member ids → names for the Change History "Team Members" diff
  // (covers MIGRATED entries whose AuditChange rows store raw ids).
  // Live audit entries store member NAMES; only legacy migrated rows store raw
  // ids needing resolution. The visible clients' rosters cover the common case;
  // a removed legacy member falls back to its raw id (rare, legacy-only) — so
  // we no longer need to load the full member list just for this map.
  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of rows) for (const tm of c.teamMembers) m.set(tm.id, tm.name);
    return m;
  }, [rows]);

  // Clients list — DB-level pagination + search + status/client filters + sort.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (viewTrash) params.set("includeDeleted", "true");
      if (sortBy) params.set("sortBy", sortBy);
      if (sortBy && sortOrder) params.set("sortOrder", sortOrder);
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus) params.set("status", filterStatus);
      if (filterClientId) params.set("clientId", filterClientId);
      const c = await fetch(`/api/client-meetings/clients?${params.toString()}`).then(r => r.json());
      if (c.success) {
        setRows(c.data);
        setTotal(c.meta?.total ?? c.data.length);
      }
    } finally { setLoading(false); }
  }, [page, pageSize, viewTrash, sortBy, sortOrder, search, filterStatus, filterClientId]);

  useEffect(() => { refresh(); }, [refresh]);

  // One-time: all-client options for the filter dropdown. Re-fetched on trash
  // toggle so the dropdown matches the active/deleted scope. (Members are no
  // longer bulk-loaded — the roster picker is infinite + the audit name map
  // comes from the visible rosters.)
  const refreshAux = useCallback(async () => {
    const all = await fetch(`/api/client-meetings/clients?limit=1000${viewTrash ? "&includeDeleted=true" : ""}`).then(r => r.json());
    if (all.success) setAllClients(all.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
  }, [viewTrash]);
  useEffect(() => { refreshAux(); }, [refreshAux]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Search / status / client filters now run server-side, so `rows` IS the
  // current page. Reset to page 1 whenever a filter/search changes.
  useEffect(() => { setPage(1); }, [search, filterClientId, filterStatus, viewTrash, pageSize]);
  const pagedClients = rows;
  const totalClientPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Drag-to-reorder ROWS (org-shared manual order) ───────────────────────
  // Enabled only in manual mode (no column sort) and outside the trash view.
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowReorderEnabled = !sortBy && !viewTrash;
  const orderedRowIds = useMemo(() => pagedClients.map((r) => r.id), [pagedClients]);
  const handleRowDrop = useCallback(
    async (fromId: string, toId: string, side: "before" | "after") => {
      const n = rowNeighbors(orderedRowIds, fromId, toId, side);
      if (!n) return;
      try {
        const res = await fetch("/api/client-meetings/clients/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fromId, beforeId: n.beforeId, afterId: n.afterId }),
        });
        if (!res.ok) throw new Error("reorder failed");
        refresh();
      } catch {
        notify.error("Failed to reorder row");
        refresh();
      }
    },
    [orderedRowIds, refresh],
  );
  const rowDnd = useRowDnD({
    getRowsContainer: () => tbodyRef.current,
    onDrop: handleRowDrop,
    canDrag: () => rowReorderEnabled,
  });
  const rowDropClass = useCallback(
    (id: string) => {
      if (rowDnd.overId !== id || !rowDnd.dropSide) return "";
      return rowDnd.dropSide === "before"
        ? "shadow-[inset_0_2px_0_0_var(--tw-shadow-color)] shadow-blue-500"
        : "shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-blue-500";
    },
    [rowDnd.overId, rowDnd.dropSide],
  );

  const activeFilterCount = (filterClientId ? 1 : 0) + (filterStatus ? 1 : 0);
  const clientOptions = useMemo(() => allClients.map(c => ({ value: c.id, label: c.name })), [allClients]);

  // Roster picker options come from the infinite hook (25/page + server search).
  const memberPickerOptions = memberOptions;

  function toggleAll() {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /** Map a client row's roster → PickerUser[] for seeding the multi-select chips. */
  function rosterSeed(teamMembers: { id: string; name: string; email: string }[]): PickerUser[] {
    return teamMembers.map(m => {
      const parts = m.name.trim().split(/\s+/);
      return { id: m.id, firstName: parts[0] ?? m.name, lastName: parts.slice(1).join(" "), email: m.email };
    });
  }

  function openCreate() {
    if (!canCreate) return;
    setError("");
    setEditSeedMembers([]);
    setEditing({ id: null, form: { ...emptyForm } });
  }
  function openEdit(row: ClientRow) {
    setError("");
    // Seed the selected roster objects so their chips render even though the
    // option list is now a paginated 25/page slice.
    setEditSeedMembers(rosterSeed(row.teamMembers));
    setEditing({
      id: row.id,
      form: {
        name: row.name,
        description: row.description ?? "",
        isActive: row.isActive,
        weeklyStartTime: row.weeklyStartTime ?? "",
        weeklyEndTime:   row.weeklyEndTime ?? "",
        dailyStartTime:  row.dailyStartTime ?? "",
        dailyEndTime:    row.dailyEndTime ?? "",
        teamMemberIds:   row.teamMembers.map(m => m.id),
      },
    });
  }

  async function handleSubmit() {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) { setError("Client name is required"); return; }
    // All 4 planned meeting times are required — the export header block
    // and the duration-followed stat depend on them. Server enforces the
    // same rule via createClientSchema.
    if (!f.dailyStartTime) { setError("Daily start time is required"); return; }
    if (!f.dailyEndTime)   { setError("Daily end time is required"); return; }
    if (!f.weeklyStartTime){ setError("Weekly start time is required"); return; }
    if (!f.weeklyEndTime)  { setError("Weekly end time is required"); return; }
    if (f.dailyEndTime <= f.dailyStartTime) { setError("D/H end must be after start"); return; }
    if (f.weeklyEndTime <= f.weeklyStartTime) { setError("Weekly end must be after start"); return; }

    setSaving(true); setError("");
    try {
      const body = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        isActive: f.isActive,
        weeklyStartTime: f.weeklyStartTime,
        weeklyEndTime:   f.weeklyEndTime,
        dailyStartTime:  f.dailyStartTime,
        dailyEndTime:    f.dailyEndTime,
        teamMemberIds:   f.teamMemberIds,
      };
      const url = editing.id ? `/api/client-meetings/clients/${editing.id}` : "/api/client-meetings/clients";
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to save"); return; }
      notify.saved("Client", editing.id ? "updated" : "created");
      setEditing(null);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
      notify.error(err, { context: "client", fallback: "Couldn't save. Please try again." });
    } finally { setSaving(false); }
  }

  async function handleBulkDelete() {
    if (!selected.size || !canDelete) return;
    if (!confirm(`Delete ${selected.size} client${selected.size === 1 ? "" : "s"}?`)) return;
    await Promise.all([...selected].map(id => fetch(`/api/client-meetings/clients/${id}`, { method: "DELETE" })));
    notify.saved("Client", "deleted");
    setSelected(new Set());
    refresh();
  }

  async function handleDeleteOne(id: string) {
    if (!canDelete) return;
    if (!confirm("Delete this client?")) return;
    await fetch(`/api/client-meetings/clients/${id}`, { method: "DELETE" });
    notify.saved("Client", "deleted");
    refresh();
  }
  async function handleRestore(id: string) {
    await fetch(`/api/client-meetings/clients/${id}/restore`, { method: "POST" });
    notify.saved("Client", "restored");
    refresh();
  }

  async function handleBulkRestore() {
    if (!selected.size) return;
    const res = await fetch(`/api/client-meetings/clients/bulk-restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const json = await res.json().catch(() => ({ success: false }));
    if (!json.success) {
      // Fall back to per-row restore if bulk endpoint isn't available
      // (handleRestore toasts per row).
      await Promise.all([...selected].map(id => handleRestore(id)));
    } else {
      notify.saved("Client", "restored");
    }
    setSelected(new Set());
    refresh();
  }

  // Export column metadata + runExport call.
  const moduleColumns = [
    { key: "name",            label: "Client Name" },
    { key: "teamMembers",     label: "Team Members" },
    { key: "dailyWindow",     label: "D/H Window" },
    { key: "weeklyWindow",    label: "Weekly Window" },
    { key: "isActive",        label: "Status" },
    { key: "description",     label: "Description" },
    { key: "createdBy",       label: "Created By" },
    { key: "updatedBy",       label: "Updated By" },
    { key: "createdAt",       label: "Created Date" },
    { key: "updatedAt",       label: "Updated Date" },
  ];
  const visibleColKeys = moduleColumns.filter(c => !hiddenCols.includes(c.key)).map(c => c.key);

  async function handleExport(sel: ExportSelection) {
    const columns = moduleColumns
      .filter(c => sel.columnKeys.includes(c.key))
      .map(c => ({
        key: c.key, label: c.label,
        value: (r: ClientRow) => {
          switch (c.key) {
            case "name":         return r.name;
            case "teamMembers":  return r.teamMembers.map(tm => tm.name).join(", ");
            case "dailyWindow":  return fmtWindow(r.dailyStartTime, r.dailyEndTime);
            case "weeklyWindow": return fmtWindow(r.weeklyStartTime, r.weeklyEndTime);
            case "isActive":     return r.isActive ? "Active" : "Inactive";
            case "description":  return r.description ?? "";
            case "createdBy":    return r.createdByName;
            case "updatedBy":    return r.updatedByName ?? "";
            case "createdAt":    return fmtDateShort(r.createdAt);
            case "updatedAt":    return fmtDateShort(r.updatedAt);
            default: return "";
          }
        },
      }));
    await runExport<ClientRow>({
      selection: sel, columns,
      pageRows: rows,
      fetchFiltered: async () => {
        // Export the full filtered set (all pages) — request a large limit
        // with the same search/status/client filters applied server-side.
        const params = new URLSearchParams({ limit: "1000" });
        if (viewTrash) params.set("includeDeleted", "true");
        if (search.trim()) params.set("search", search.trim());
        if (filterStatus) params.set("status", filterStatus);
        if (filterClientId) params.set("clientId", filterClientId);
        const res = await fetch(`/api/client-meetings/clients?${params.toString()}`);
        const j = await res.json();
        return j.success ? (j.data as ClientRow[]) : [];
      },
      fetchAll: async () => {
        const res = await fetch("/api/client-meetings/clients?limit=1000");
        const j = await res.json();
        return j.success ? (j.data as ClientRow[]) : [];
      },
      filename: `ClientMaster${viewTrash ? "-Trash" : ""}`,
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Single-row header — matches Individual KPI. */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Client Master</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{total} items</span>
          {currentWeek !== null && (
            <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {quarter} · Week {currentWeek}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && canDelete && !viewTrash && (
            <button onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </button>
          )}
          {selected.size > 0 && canDelete && viewTrash && (
            <button onClick={handleBulkRestore}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6-6m-6 6l6 6" />
              </svg>
              Restore {selected.size} selected
            </button>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44" />
          </div>

          <div className="relative" ref={filterRef}>
            <button onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}>
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : "Filter"}
            </button>
            {showFilter && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Client</p>
                  <FilterPicker value={filterClientId} onChange={setFilterClientId} options={clientOptions} allLabel="All clients" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "" | "active" | "inactive")}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                {(filterClientId || filterStatus) && (
                  <button onClick={() => { setFilterClientId(""); setFilterStatus(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          <ModuleMoreActions
            columns={moduleColumns}
            hiddenCols={hiddenCols}
            onHiddenColsChange={setHiddenCols}
            isTrashActive={viewTrash}
            onToggleTrash={setViewTrash}
            rowCounts={{ page: rows.length, filtered: total, all: total }}
            onExport={handleExport}
            defaultExportColumnKeys={visibleColKeys}
          />

          {canCreate && <AddButton onClick={openCreate}>Add New</AddButton>}
        </div>
      </div>

      {viewTrash && (
        <div className="px-6 py-2 flex-shrink-0">
          <TrashBanner count={total} onExit={() => setViewTrash(false)} />
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Users}
              title={search ? "No matches" : viewTrash ? "Trash is empty" : "Add your first client"}
              message={search ? "Try a different search term." : "Clients are the external organisations you run meeting rhythm for. Planned meeting windows power the Dashboard's punctuality and duration-followed metrics."}
              action={!search && !viewTrash && canCreate ? { label: "Add your first client", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col min-h-0">
            <HorizontalScroller className="flex-1">
            <table
              className="text-xs bg-white border-separate border-spacing-0"
              style={{ width: "100%", minWidth: "max-content", tableLayout: "fixed" }}>
              <thead className="sticky top-0 bg-accent-50 z-10">
                {/* `ref` + `data-col-key` on every `<th>` (rail + user cols)
                    feed useStickyOffsets so each frozen column gets a `left`
                    measured from the actual DOM — no hardcoded pixel offsets. */}
                <tr ref={headerRowRef}>
                  <th data-col-key="_checkbox"
                      className="sticky z-[35] px-3 py-3 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                    <label
                      onClickCapture={(e) => {
                        if (!canDelete) {
                          e.preventDefault();
                          e.stopPropagation();
                          notify.error("You don't have permission to delete");
                        }
                      }}
                    >
                      <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} disabled={!canDelete}
                        className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                    </label>
                  </th>
                  <th data-col-key="_log"
                      className="sticky z-[35] text-left px-3 py-3 font-semibold text-gray-600 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 40, width: 56, minWidth: 56, maxWidth: 56 }}>Log</th>
                  <th data-col-key="_id"
                      className="sticky z-[35] text-left px-3 py-3 font-semibold text-gray-600 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 96, width: 56, minWidth: 56, maxWidth: 56 }}>ID</th>
                  {orderedNonRail.map((k) => {
                    const meta = CLIENT_HEADER_META[k];
                    if (!meta) return null;
                    return <Header key={k} k={k} label={meta.label} sortable={meta.sortable} sortKey={meta.sortKey} />;
                  })}
                  <th className="w-10 px-3 py-3 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {pagedClients.map(r => (
                  <tr key={r.id} data-row-id={r.id} data-row-label={r.name}
                    onPointerDown={rowReorderEnabled ? (e) => rowDnd.startDrag(r.id, e) : undefined}
                    className={`group border-b border-gray-100 hover:bg-blue-50/30 ${rowReorderEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${selected.has(r.id) ? "bg-blue-50/60" : ""} ${rowDropClass(r.id)} ${rowDnd.draggingId === r.id ? "opacity-40" : ""}`}>
                    <td className="sticky z-[15] bg-white px-3 py-3 text-center border-b border-r border-gray-100"
                        style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete) {
                            e.preventDefault();
                            e.stopPropagation();
                            notify.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} disabled={!canDelete}
                          className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                      </label>
                    </td>
                    <td className="sticky z-[15] bg-white px-3 py-3 border-b border-r border-gray-100"
                        style={{ left: 40, width: 56, minWidth: 56, maxWidth: 56 }}>
                      <button onClick={() => setLogOpen(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500" title="View audit log">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="sticky z-[15] bg-white px-3 py-3 border-b border-r border-gray-100"
                        style={{ left: 96, width: 56, minWidth: 56, maxWidth: 56 }}>
                      <button onClick={() => openEdit(r)} className="text-blue-600 hover:underline font-medium">{r.displayId}</button>
                    </td>
                    {/* Data cells rendered in the user's drag order (see
                        renderClientCell). Styling unchanged; widths match each <th>. */}
                    {orderedNonRail.map((k) => renderClientCell(r, k))}
                    <td className="px-3 py-3">
                      {viewTrash && canDelete ? (
                        <button onClick={() => handleRestore(r.id)} className="p-1 rounded hover:bg-green-50 text-gray-300 hover:text-green-600" title="Restore">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : canDelete ? (
                        <button onClick={() => handleDeleteOne(r.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </HorizontalScroller>
            {rowDnd.dragGhost}
            {total > 0 && (
              <Pagination
                page={page}
                totalPages={totalClientPages}
                total={total}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Add/Edit drawer — fields per image 1. */}
      {editing && (() => {
        // RBAC v2: existing rows in edit mode require `update`; create mode
        // requires `create` (already gated at the Add button, but defend the
        // drawer too in case it's opened mid-session). Fields are disabled
        // and Save is hidden when the role denies the action.
        const drawerLocked = editing.id ? !canUpdate : !canCreate;
        return (
        <RightPanel
          open
          onClose={() => setEditing(null)}
          size="sm"
          title="Client Master"
          subtitle={editing.id ? "Edit record" : "Create new record"}
          footer={
            // Column wrapper pins the server-error banner directly above the
            // Cancel/Submit row so users don't have to scroll up to see it.
            <div className="flex flex-col gap-2 w-full">
              <FormErrorBanner message={error} />
              <RightPanelFooter>
                <RightPanelCancelButton onClick={() => setEditing(null)} />
                {!drawerLocked && (
                  <RightPanelSubmitButton
                    onClick={handleSubmit} saving={saving}
                    icon={editing.id ? "check" : "plus"}
                    label="Submit"
                  />
                )}
              </RightPanelFooter>
            </div>
          }
        >
          {drawerLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              Read-only — your role doesn&apos;t grant {editing.id ? "update" : "create"} access on Client Master.
            </div>
          )}

          <fieldset disabled={drawerLocked} className={`space-y-4 ${drawerLocked ? "opacity-70" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Members <span className="text-red-500">*</span></label>
            {/* "No members yet" only when the roster is genuinely empty (not
                loading, no search, no already-selected roster). */}
            {!membersLoading && memberOptions.length === 0 && !memberSearch && editSeedMembers.length === 0 ? (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No Client Members yet. Add some in Meeting Rhythm → Client Members first.
              </p>
            ) : (
              <UserMultiPicker
                values={editing.form.teamMemberIds}
                onChange={(ids) => setEditing({ ...editing, form: { ...editing.form, teamMemberIds: ids } })}
                users={memberPickerOptions}
                selectedUsers={editSeedMembers}
                onSearchChange={setMemberSearch}
                onLoadMore={fetchMoreMembers}
                hasMore={membersHasMore}
                loadingMore={membersLoadingMore}
                loading={membersLoading}
                placeholder="Select members…"
                // Show every selected member as a chip (no "+N more" collapse) —
                // the trigger uses flex-wrap so chips wrap onto multiple lines.
                chipLimit={Infinity}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client Name <span className="text-red-500">*</span></label>
            <input value={editing.form.name}
              onChange={e => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">D/H Planned Start Time <span className="text-red-500">*</span></label>
              <input type="time" value={editing.form.dailyStartTime}
                onChange={e => setEditing({ ...editing, form: { ...editing.form, dailyStartTime: e.target.value } })}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">D/H Planned End Time <span className="text-red-500">*</span></label>
              <input type="time" value={editing.form.dailyEndTime}
                onChange={e => setEditing({ ...editing, form: { ...editing.form, dailyEndTime: e.target.value } })}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weekly Start Time <span className="text-red-500">*</span></label>
              <input type="time" value={editing.form.weeklyStartTime}
                onChange={e => setEditing({ ...editing, form: { ...editing.form, weeklyStartTime: e.target.value } })}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weekly End Time <span className="text-red-500">*</span></label>
              <input type="time" value={editing.form.weeklyEndTime}
                onChange={e => setEditing({ ...editing, form: { ...editing.form, weeklyEndTime: e.target.value } })}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Is Client Active? <span className="text-red-500">*</span></label>
            <Segmented
              value={editing.form.isActive ? "yes" : "no"}
              onChange={(v) => setEditing({ ...editing, form: { ...editing.form, isActive: v === "yes" } })}
              options={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea rows={4} value={editing.form.description}
              onChange={e => setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })}
              placeholder="Add any relevant description…"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
          </div>
          </fieldset>
        </RightPanel>
        );
      })()}

      {/* Change History — full audit timeline (shared EntityChangeHistoryPanel) */}
      {logOpen && (
        <ClientChangeHistoryPanel client={logOpen} nameById={memberNameById} onClose={() => setLogOpen(null)} />
      )}
    </div>
  );
}
