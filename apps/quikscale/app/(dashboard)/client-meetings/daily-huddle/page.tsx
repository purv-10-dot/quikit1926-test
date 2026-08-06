"use client";

/**
 * Daily Huddle — flat list + right-panel drawer with Log + Edit tabs.
 *
 * Layout mirrors Individual KPI exactly: single header row with pills +
 * controls, dense table body, RightPanel drawer. The drawer's Log tab
 * surfaces the audit history; the Edit tab renders the fields from image 1.
 *
 * Field mapping (kept DB column names for backward-compat with dashboard
 * math that counts YES/NA as "passed"):
 *   - Yesterday's Achievements ↔ format1Status  (YES/NO ↔ YES/NO, NA when unset)
 *   - Today's Priority          ↔ format2Status
 *   - Stuck Issues              ↔ stuckCallStatus
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFilterContext } from "@/lib/context/FilterContext";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton,
  AddButton, EmptyState, Segmented, FilterPicker, UserMultiPicker, Pagination, type ExportSelection,
  useConfirm,
} from "@quikit/ui";
import { Calendar, History, Clock, Search, Filter, Trash2, RotateCcw } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort, useDebouncedTableSearch } from "@/lib/store";
import { useColumnResize } from "@/lib/hooks/useColumnResize";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { moveByKey, columnsUnfrozenBy, columnsFrozenBy } from "@/lib/utils/columnOrder";
import { confirmFreezeChange } from "@/lib/utils/freezeConfirm";
import { useColumnDnD } from "@/lib/hooks/useColumnDnD";
import { useRowDnD } from "@/lib/hooks/useRowDnD";
import { rowNeighbors } from "@/lib/utils/rowOrder";
import { useStickyOffsets } from "@/lib/hooks/useStickyOffsets";
import { HeaderCell } from "@/components/table/HeaderCell";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";

// Daily Huddle column layout. Rail cols never reorder; the rest are
// user-draggable + persisted per user via useColumnOrder("dailyHuddle").
const HUDDLE_RAIL_COLS = ["_checkbox", "_log", "_id"] as const;
const HUDDLE_DEFAULT_NON_RAIL = [
  "meetingDate", "client", "callStatus", "absentMembers",
  "actualStartTime", "actualEndTime",
  "yesterdaysAchievements", "todaysPriority", "stuckIssues",
  "createdBy", "updatedBy", "createdAt", "updatedAt",
];
const HUDDLE_HEADER_META: Record<string, { label: string; sortable?: boolean; sortKey?: string }> = {
  meetingDate: { label: "Meeting Date", sortable: true },
  client: { label: "Client", sortable: true, sortKey: "client" },
  callStatus: { label: "Call Status", sortable: true },
  absentMembers: { label: "Absent Members" },
  actualStartTime: { label: "Start", sortable: true },
  actualEndTime: { label: "End", sortable: true },
  yesterdaysAchievements: { label: "Yesterday" },
  todaysPriority: { label: "Today" },
  stuckIssues: { label: "Stuck" },
  createdBy: { label: "Created By" },
  updatedBy: { label: "Updated By" },
  createdAt: { label: "Created Date", sortable: true },
  updatedAt: { label: "Updated Date", sortable: true },
};

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  meetingDate: 110,
  client: 200,
  callStatus: 110,
  absentMembers: 200,
  actualStartTime: 90,
  actualEndTime: 90,
  yesterdaysAchievements: 100,
  todaysPriority: 90,
  stuckIssues: 80,
  createdBy: 160,
  updatedBy: 160,
  createdAt: 120,
  updatedAt: 120,
};
import { notify } from "@/lib/utils/notify";
import { runExport } from "@/lib/export/xlsx";
import { DailyHuddleChangeHistoryPanel } from "./DailyHuddleChangeHistoryPanel";
import { ExportDataModal, type ExportRange } from "@/components/client-meetings/ExportDataModal";
import { GlobalExportModal, type GlobalExportSelection } from "@/components/export/GlobalExportModal";
import { downloadExport } from "@/lib/exports/downloadExport";
import { FileBarChart } from "lucide-react";

// All statuses that can appear in the data — mirrors the `ClientMeetingStatus`
// Prisma enum. NOT_HELD stays in the union so legacy records still type-check
// and display, even though it's no longer offered in the picker.
type Status =
  | "HELD"
  | "NOT_HELD"
  | "CALL_CANCELLED_BY_CLIENT"
  | "HOLIDAY_FOR_CLIENT"
  | "HOLIDAY_FOR_SUCCESS_ALCHEMIST";

// Display labels for every status (used by the table cell + badge), so legacy
// NOT_HELD rows still read nicely even though it isn't selectable.
const STATUS_LABELS: Record<Status, string> = {
  HELD: "Held",
  NOT_HELD: "Not Held",
  CALL_CANCELLED_BY_CLIENT: "Call cancelled by client",
  HOLIDAY_FOR_CLIENT: "Holiday for client",
  HOLIDAY_FOR_SUCCESS_ALCHEMIST: "Holiday for Success Alchemist",
};

// Options offered in the Create/Edit dropdown. NOT_HELD intentionally omitted
// per product decision — existing NOT_HELD records still display via STATUS_LABELS.
const STATUS_OPTS: Array<{ value: Status; label: string }> = [
  { value: "HELD", label: STATUS_LABELS.HELD },
  { value: "CALL_CANCELLED_BY_CLIENT", label: STATUS_LABELS.CALL_CANCELLED_BY_CLIENT },
  { value: "HOLIDAY_FOR_CLIENT", label: STATUS_LABELS.HOLIDAY_FOR_CLIENT },
  { value: "HOLIDAY_FOR_SUCCESS_ALCHEMIST", label: STATUS_LABELS.HOLIDAY_FOR_SUCCESS_ALCHEMIST },
];

interface ClientOpt { id: string; name: string; teamMembers: { id: string; name: string; email: string }[] }
interface MemberOpt { id: string; name: string; email: string }

interface HuddleRow {
  id: string;
  displayId: number;
  clientId: string; clientName: string;
  meetingDate: string; callStatus: Status;
  actualStartTime: string | null; actualEndTime: string | null;
  yesterdaysAchievements: boolean;
  todaysPriority: boolean;
  stuckIssues: boolean;
  totalMembers: number;
  notesKPDashboard: string | null; otherNotes: string | null;
  absentClientMemberIds: string[];
  absentTeamMemberNames: string[];
  createdAt: string; updatedAt: string;
  createdBy: string; createdByName: string; createdByInitials: string;
  updatedBy: string | null;
  updatedByName: string | null; updatedByInitials: string | null;
}

const emptyForm = {
  clientId: "", meetingDate: new Date().toISOString().slice(0, 10),
  callStatus: "HELD" as Status,
  actualStartTime: "", actualEndTime: "",
  yesterdaysAchievements: false, todaysPriority: false, stuckIssues: false,
  notesKPDashboard: "", otherNotes: "",
  absentClientMemberIds: [] as string[],
};

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function statusBadge(s: Status) {
  return s === "HELD" ? "bg-green-100 text-green-700"
       : s === "NOT_HELD" ? "bg-red-100 text-red-700"
       : s === "CALL_CANCELLED_BY_CLIENT" ? "bg-amber-100 text-amber-700"
       : "bg-blue-100 text-blue-700"; // holidays — neutral/info
}
function statusLabel(s: Status) { return STATUS_LABELS[s] ?? s; }

export default function DailyHuddlePage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("DailyHuddle");
  const { year, quarter } = useFilterContext();
  const currentWeek = useCurrentWeek(year, quarter);

  const [rows, setRows] = useState<HuddleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput, search] = useDebouncedTableSearch("dailyHuddle");
  const [viewTrash, setViewTrash] = useState(false);

  // Pagination — default 10 rows, options 10/20/30/50.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // New From / To / Client export modal — replaces the legacy column
  // selection ExportModal that ModuleMoreActions opens by default.
  const [exportOpen, setExportOpen] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");

  // Server-persisted column preferences (frozen / hidden / sort) via the
  // UserTablePreference table in app_quikscale. Same shape as KPI / Priority /
  // WWW — see lib/hooks/useTablePreferences.ts.
  const {
    hiddenCols,
    setHiddenCols,
    frozenCol: frozenUpTo,
    setFrozenCol,
    hideCol,
  } = useTablePrefs("dailyHuddle");
  const { sortBy, sortOrder, setSort } = useTableSort("dailyHuddle");
  const { getColWidth, startResize, colWidths } = useColumnResize("dailyHuddle", COL_WIDTHS_DEFAULT);

  // Cascade-freeze infrastructure — mirrors KPITable + Weekly Meeting so the
  // user-experience is identical across tables: freezing column C pins every
  // column from the always-frozen rail (`_checkbox`/`_log`/`_id`, total
  // 152px) up to and including C. `useStickyOffsets` measures the real
  // header widths so each frozen cell receives the correct `left` value.
  const {
    orderedCols: orderedNonRail,
    applyOrder: applyColumnOrder,
  } = useColumnOrder("dailyHuddle", HUDDLE_DEFAULT_NON_RAIL, { alwaysFrozen: HUDDLE_RAIL_COLS });
  const COL_ORDER = useMemo(
    () => [...HUDDLE_RAIL_COLS, ...orderedNonRail],
    [orderedNonRail],
  );
  const hiddenSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  // See Weekly Meeting for why the fallback is needed — same first-paint
  // flash, same fix. Rail here is 40+56+56 = 152px (Daily Huddle / Clients
  // / Members share the same dimensions; Weekly Meeting uses the smaller
  // 32+32+40 = 104px rail).
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
      const nextFull = [...HUDDLE_RAIL_COLS, ...nextNonRail];
      const curFull = [...HUDDLE_RAIL_COLS, ...orderedNonRail];
      const unfrozen = columnsUnfrozenBy(curFull, nextFull, frozenUpTo, HUDDLE_RAIL_COLS);
      const frozen = columnsFrozenBy(curFull, nextFull, frozenUpTo, HUDDLE_RAIL_COLS);
      if (!(await confirmFreezeChange(confirmDialog, unfrozen, frozen))) return;
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

  /** `<td>` className addition for cascade-frozen columns. Body cells sit on
   *  z-[10] so the matching header (z-[35]) is always above them — keeps
   *  the ColMenu dropdown visible over any frozen body cell beneath it. */
  function tdFreezeClass(k: string): string {
    return isFrozen(k) ? "sticky z-[10] bg-white" : "";
  }
  /** Inline style for any cell in the frozen cascade — adds the measured
   *  `left` so the cell sits flush with its sibling rail/columns. Returns
   *  width-only when the column isn't frozen. */
  function freezeStyle(k: string): React.CSSProperties {
    const w = getColWidth(k);
    if (isFrozen(k)) return { width: w, minWidth: w, left: getStickyLeft(k) };
    return { width: w };
  }

  // Adapter that binds local table state to the shared <HeaderCell>. Each
  // `<Header k="…" label="…" sortable sortKey="…" />` renders one column
  // header (sort arrow + ColMenu + resize handle + freeze icon when
  // boundary), returning null when the column is hidden.
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

  // Render one draggable huddle column body cell by key. Styling unchanged.
  const renderHuddleCell = (r: HuddleRow, k: string) => {
    if (isHidden(k)) return null;
    switch (k) {
      case "meetingDate":
        return (
          <td key={k} style={freezeStyle("meetingDate")} className={`px-3 py-3 text-gray-700 whitespace-nowrap overflow-hidden ${tdFreezeClass("meetingDate")}`}>
            {fmtDate(r.meetingDate)}
          </td>
        );
      case "client":
        return (
          <td key={k} style={freezeStyle("client")} className={`px-3 py-3 text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap ${tdFreezeClass("client")}`}>
            {r.clientName}
          </td>
        );
      case "callStatus":
        return (
          <td key={k} style={freezeStyle("callStatus")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("callStatus")}`}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(r.callStatus)}`}>
              {statusLabel(r.callStatus)}
            </span>
          </td>
        );
      case "absentMembers":
        return (
          <td key={k} style={freezeStyle("absentMembers")} className={`px-3 py-3 text-gray-600 overflow-hidden ${tdFreezeClass("absentMembers")}`}>
            {r.absentTeamMemberNames.length === 0 ? <span className="text-gray-300">—</span> : (
              <span title={r.absentTeamMemberNames.join(", ")} className="whitespace-nowrap text-ellipsis overflow-hidden block">
                {r.absentTeamMemberNames.slice(0, 2).join(", ")}
                {r.absentTeamMemberNames.length > 2 && ` +${r.absentTeamMemberNames.length - 2}`}
              </span>
            )}
          </td>
        );
      case "actualStartTime":
        return (
          <td key={k} style={freezeStyle("actualStartTime")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("actualStartTime")}`}>
            {r.actualStartTime ?? <span className="text-gray-300">—</span>}
          </td>
        );
      case "actualEndTime":
        return (
          <td key={k} style={freezeStyle("actualEndTime")} className={`px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden ${tdFreezeClass("actualEndTime")}`}>
            {r.actualEndTime ?? <span className="text-gray-300">—</span>}
          </td>
        );
      case "yesterdaysAchievements":
        return (
          <td key={k} style={freezeStyle("yesterdaysAchievements")} className={`px-3 py-3 text-gray-600 overflow-hidden ${tdFreezeClass("yesterdaysAchievements")}`}>
            {r.yesterdaysAchievements ? "✓" : "✗"}
          </td>
        );
      case "todaysPriority":
        return (
          <td key={k} style={freezeStyle("todaysPriority")} className={`px-3 py-3 text-gray-600 overflow-hidden ${tdFreezeClass("todaysPriority")}`}>
            {r.todaysPriority ? "✓" : "✗"}
          </td>
        );
      case "stuckIssues":
        return (
          <td key={k} style={freezeStyle("stuckIssues")} className={`px-3 py-3 text-gray-600 overflow-hidden ${tdFreezeClass("stuckIssues")}`}>
            {r.stuckIssues ? "✓" : "✗"}
          </td>
        );
      case "createdBy":
        return (
          <td key={k} style={freezeStyle("createdBy")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("createdBy")}`}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">{r.createdByInitials}</span>
              <span className="text-xs text-gray-700 whitespace-nowrap text-ellipsis overflow-hidden">{r.createdByName}</span>
            </div>
          </td>
        );
      case "updatedBy":
        return (
          <td key={k} style={freezeStyle("updatedBy")} className={`px-3 py-3 overflow-hidden ${tdFreezeClass("updatedBy")}`}>
            {r.updatedByName ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">{r.updatedByInitials}</span>
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

  const [editing, setEditing] = useState<{ id: string | null; tab: "log" | "edit"; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Change History now opens the shared standalone drawer (not a Log tab here).
  const [logHuddle, setLogHuddle] = useState<HuddleRow | null>(null);

  // Huddles list — DB-level pagination + search + client/status filters + sort.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (filterClientId) params.set("clientId", filterClientId);
      if (filterStatus) params.set("status", filterStatus);
      if (viewTrash) params.set("includeDeleted", "true");
      if (sortBy) params.set("sortBy", sortBy);
      if (sortBy && sortOrder) params.set("sortOrder", sortOrder);
      if (search.trim()) params.set("search", search.trim());
      const h = await fetch(`/api/client-meetings/daily-huddles?${params.toString()}`).then(r => r.json());
      if (h.success) {
        setRows(h.data);
        setTotal(h.meta?.total ?? h.data.length);
      }
    } finally { setLoading(false); }
  }, [page, pageSize, filterClientId, filterStatus, viewTrash, sortBy, sortOrder, search]);

  useEffect(() => { refresh(); }, [refresh]);

  // One-time: client + member option lists (dropdowns + absent picker).
  useEffect(() => {
    void Promise.all([
      fetch("/api/client-meetings/clients?limit=1000").then(r => r.json()),
      fetch("/api/client-meetings/members?limit=1000").then(r => r.json()),
    ]).then(([c, m]) => {
      if (c.success) setClients(c.data);
      if (m.success) setMembers(m.data);
    });
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Search + client + status filters run server-side; `rows` IS the page.
  const activeFilterCount = (filterClientId ? 1 : 0) + (filterStatus ? 1 : 0);
  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients]);

  useEffect(() => { setPage(1); }, [search, filterClientId, filterStatus, viewTrash, pageSize]);
  const pagedHuddles = rows;

  // ── Drag-to-reorder ROWS (org-shared manual order) ───────────────────────
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowReorderEnabled = !sortBy && !viewTrash;
  const orderedRowIds = useMemo(() => pagedHuddles.map((r) => r.id), [pagedHuddles]);
  const handleRowDrop = useCallback(
    async (fromId: string, toId: string, side: "before" | "after") => {
      const n = rowNeighbors(orderedRowIds, fromId, toId, side);
      if (!n) return;
      try {
        const res = await fetch("/api/client-meetings/daily-huddles/reorder", {
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
  const totalHuddlePages = Math.max(1, Math.ceil(total / pageSize));

  // Members eligible to be marked absent — scoped to the SELECTED client's
  // roster (the ClientTeamMember join returned by the clients API), NOT the
  // org-wide member list: a huddle's absentees must belong to that client.
  // Any already-selected id no longer on the roster (member removed after the
  // huddle was saved) is unioned back in so editing an old record never
  // silently drops a saved absentee. Adapted to PickerUser (name split on first space).
  const clientMemberOptions = useMemo(() => {
    const clientId = editing?.form.clientId;
    if (!clientId) return [];
    const roster = clients.find(c => c.id === clientId)?.teamMembers ?? [];
    const byId = new Map(roster.map(m => [m.id, { id: m.id, name: m.name, email: m.email }]));
    for (const id of editing?.form.absentClientMemberIds ?? []) {
      if (!byId.has(id)) {
        const m = members.find(mm => mm.id === id);
        if (m) byId.set(id, { id: m.id, name: m.name, email: m.email });
      }
    }
    return [...byId.values()].map(m => {
      const parts = m.name.trim().split(/\s+/);
      return { id: m.id, firstName: parts[0] ?? m.name, lastName: parts.slice(1).join(" "), email: m.email };
    });
  }, [editing?.form.clientId, editing?.form.absentClientMemberIds, clients, members]);

  function toggleAll() {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openCreate() {
    setError("");
    setEditing({ id: null, tab: "edit", form: { ...emptyForm, clientId: filterClientId || clients[0]?.id || "" } });
  }

  function openDetail(row: HuddleRow) {
    setError("");
    setEditing({
      id: row.id, tab: "edit",
      form: {
        clientId: row.clientId,
        meetingDate: row.meetingDate.slice(0, 10),
        callStatus: row.callStatus,
        actualStartTime: row.actualStartTime ?? "",
        actualEndTime:   row.actualEndTime ?? "",
        yesterdaysAchievements: row.yesterdaysAchievements,
        todaysPriority:         row.todaysPriority,
        stuckIssues:            row.stuckIssues,
        notesKPDashboard: row.notesKPDashboard ?? "",
        otherNotes:        row.otherNotes ?? "",
        absentClientMemberIds: row.absentClientMemberIds,
      },
    });
  }

  function updateStatus(next: Status) {
    if (!editing) return;
    if (next !== "HELD") {
      setEditing({
        ...editing,
        form: {
          ...editing.form, callStatus: next,
          actualStartTime: "", actualEndTime: "",
          yesterdaysAchievements: false, todaysPriority: false, stuckIssues: false,
        },
      });
    } else {
      setEditing({ ...editing, form: { ...editing.form, callStatus: next } });
    }
  }

  async function handleSubmit() {
    if (!editing) return;
    const f = editing.form;
    if (!f.clientId) { setError("Pick a client"); return; }
    if (!f.meetingDate) { setError("Meeting date required"); return; }
    // Held → the meeting happened, so its start/end times are mandatory. Mirrors
    // the server-side refine in clientMeetingsSchema.
    if (f.callStatus === "HELD" && (!f.actualStartTime || !f.actualEndTime)) {
      setError("Actual Start Time and Actual End Time are required when the call status is Held"); return;
    }
    if (f.actualStartTime && f.actualEndTime && f.actualEndTime <= f.actualStartTime) {
      setError("Actual end time must be after start time"); return;
    }
    setSaving(true); setError("");
    try {
      const body = {
        clientId: f.clientId,
        meetingDate: new Date(f.meetingDate).toISOString(),
        callStatus: f.callStatus,
        actualStartTime: f.actualStartTime || null,
        actualEndTime:   f.actualEndTime || null,
        format1Status:   f.yesterdaysAchievements ? "YES" : "NO",
        format2Status:   f.todaysPriority         ? "YES" : "NO",
        stuckCallStatus: f.stuckIssues            ? "YES" : "NO",
        notesKPDashboard: f.notesKPDashboard || null,
        otherNotes:        f.otherNotes || null,
        absentClientMemberIds: f.absentClientMemberIds,
      };
      const url = editing.id ? `/api/client-meetings/daily-huddles/${editing.id}` : "/api/client-meetings/daily-huddles";
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed"); return; }
      notify.saved("Daily huddle", editing.id ? "updated" : "created");
      setEditing(null);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      notify.error(err, { context: "daily huddle", fallback: "Couldn't save. Please try again." });
    } finally { setSaving(false); }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} huddle${selected.size === 1 ? "" : "s"}?`)) return;
    await Promise.all([...selected].map(id => fetch(`/api/client-meetings/daily-huddles/${id}`, { method: "DELETE" })));
    notify.saved("Daily huddle", "deleted");
    setSelected(new Set());
    refresh();
  }

  async function handleDeleteOne(id: string) {
    if (!confirm("Delete this huddle?")) return;
    await fetch(`/api/client-meetings/daily-huddles/${id}`, { method: "DELETE" });
    notify.saved("Daily huddle", "deleted");
    refresh();
  }
  async function handleRestore(id: string) {
    await fetch(`/api/client-meetings/daily-huddles/${id}/restore`, { method: "POST" });
    notify.saved("Daily huddle", "restored");
    refresh();
  }

  async function handleBulkRestore() {
    if (!selected.size) return;
    await fetch(`/api/client-meetings/daily-huddles/bulk-restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    notify.saved("Daily huddle", "restored");
    setSelected(new Set());
    refresh();
  }

  // Export column metadata.
  const moduleColumns = [
    { key: "meetingDate",            label: "Meeting Date" },
    { key: "client",                 label: "Client Name" },
    { key: "callStatus",             label: "Call Status" },
    { key: "absentMembers",          label: "Absent Members" },
    { key: "actualStartTime",        label: "Actual Start Time" },
    { key: "actualEndTime",          label: "Actual End Time" },
    { key: "yesterdaysAchievements", label: "Yesterday's Achievements" },
    { key: "todaysPriority",         label: "Today's Priority" },
    { key: "stuckIssues",            label: "Stuck Issues" },
    { key: "notesKPDashboard",       label: "Notes K&P Dashboard" },
    { key: "otherNotes",             label: "Other Notes" },
    { key: "createdBy",              label: "Created By" },
    { key: "updatedBy",              label: "Updated By" },
    { key: "createdAt",              label: "Created Date" },
    { key: "updatedAt",              label: "Updated Date" },
  ];
  const visibleColKeys = moduleColumns.filter(c => !hiddenCols.includes(c.key)).map(c => c.key);
  const isHidden = (key: string) => hiddenCols.includes(key);

  // Global Export (row-per-record, date-range) — the primary Export Data action.
  // The aggregate metrics report (ExportDataModal → /export/daily-detail) stays
  // reachable as a secondary "Metrics Report…" menu item.
  const [globalExportOpen, setGlobalExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const handleGlobalExport = async (sel: GlobalExportSelection) => {
    setExportError(null);
    try {
      await downloadExport("/api/client-meetings/daily-huddles/export", {
        columns: sel.columnKeys.join(","),
        from: sel.range.mode === "date" ? sel.range.from : undefined,
        to: sel.range.mode === "date" ? sel.range.to : undefined,
        clientId: filterClientId || undefined,
        status: filterStatus || undefined,
        includeDeleted: viewTrash || undefined,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
      throw err;
    }
  };

  async function handleExport(sel: ExportSelection) {
    const columns = moduleColumns
      .filter(c => sel.columnKeys.includes(c.key))
      .map(c => ({
        key: c.key, label: c.label,
        value: (r: HuddleRow) => {
          switch (c.key) {
            case "meetingDate":            return fmtDateShort(r.meetingDate);
            case "client":                 return r.clientName;
            case "callStatus":             return statusLabel(r.callStatus);
            case "absentMembers":          return r.absentTeamMemberNames.join(", ");
            case "actualStartTime":        return r.actualStartTime ?? "";
            case "actualEndTime":          return r.actualEndTime ?? "";
            case "yesterdaysAchievements": return r.yesterdaysAchievements ? "YES" : "NO";
            case "todaysPriority":         return r.todaysPriority ? "YES" : "NO";
            case "stuckIssues":            return r.stuckIssues ? "YES" : "NO";
            case "notesKPDashboard":       return r.notesKPDashboard ?? "";
            case "otherNotes":             return r.otherNotes ?? "";
            case "createdBy":              return r.createdByName;
            case "updatedBy":              return r.updatedByName ?? "";
            case "createdAt":              return fmtDateShort(r.createdAt);
            case "updatedAt":              return fmtDateShort(r.updatedAt);
            default: return "";
          }
        },
      }));
    await runExport<HuddleRow>({
      selection: sel, columns, pageRows: rows,
      fetchFiltered: async () => {
        const params = new URLSearchParams({ limit: "1000" });
        if (filterClientId) params.set("clientId", filterClientId);
        if (filterStatus) params.set("status", filterStatus);
        if (viewTrash) params.set("includeDeleted", "true");
        if (search.trim()) params.set("search", search.trim());
        const r = await fetch(`/api/client-meetings/daily-huddles?${params.toString()}`).then(r => r.json());
        return r.success ? (r.data as HuddleRow[]) : [];
      },
      fetchAll: async () => {
        const r = await fetch("/api/client-meetings/daily-huddles?limit=1000").then(r => r.json());
        return r.success ? (r.data as HuddleRow[]) : [];
      },
      filename: `DailyHuddle${viewTrash ? "-Trash" : ""}`,
    });
  }

  const isHeld = editing?.form.callStatus === "HELD";

  return (
    <div className="flex flex-col h-full">
      {/* KPI-style header row */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Daily Huddle</h1>
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
              <RotateCcw className="h-3.5 w-3.5" /> Restore {selected.size} selected
            </button>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search..."
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
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "" | Status)}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    <option value="">All status</option>
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            // Primary Export Data → the unified Global Export (row-per-record,
            // date range, .xlsx/PDF). The aggregate per-client monthly metrics
            // report stays available as a secondary "Metrics Report…" item.
            onExportClick={() => setGlobalExportOpen(true)}
            extraItems={[
              {
                key: "metrics-report",
                label: "Metrics Report…",
                icon: FileBarChart,
                onSelect: () => setExportOpen(true),
              },
            ]}
          />

          {canCreate && <AddButton onClick={openCreate} disabled={clients.length === 0}>Add New</AddButton>}
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
              icon={Calendar}
              title={search ? "No matches" : viewTrash ? "Trash is empty" : clients.length === 0 ? "Add a client first" : "No huddles yet"}
              message={clients.length === 0
                ? "Daily huddles hang off clients. Create a client in Client Master, then log a huddle here."
                : "Log your first daily huddle — capture call status, format adherence, and absent members."}
              action={!search && !viewTrash && canCreate && clients.length > 0 ? { label: "Log a huddle", onClick: openCreate } : undefined}
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
                    const meta = HUDDLE_HEADER_META[k];
                    if (!meta) return null;
                    return <Header key={k} k={k} label={meta.label} sortable={meta.sortable} sortKey={meta.sortKey} />;
                  })}
                  <th className="w-10 px-3 py-3 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {pagedHuddles.map(r => (
                  <tr key={r.id} data-row-id={r.id} data-row-label={r.clientName}
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
                      <button onClick={() => setLogHuddle(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500" title="View log">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td data-no-drag className="sticky z-[15] bg-white px-3 py-3 border-b border-r border-gray-100"
                        style={{ left: 96, width: 56, minWidth: 56, maxWidth: 56 }}>
                      <button onClick={() => openDetail(r)} className="absolute inset-0 flex items-center justify-center text-blue-600 hover:underline font-medium">{r.displayId}</button>
                    </td>
                    {/* Cells rendered in the user's drag order (renderHuddleCell). */}
                    {orderedNonRail.map((k) => renderHuddleCell(r, k))}
                    <td className="px-3 py-3">
                      {viewTrash ? (
                        <button onClick={() => handleRestore(r.id)} className="p-1 rounded hover:bg-green-50 text-gray-300 hover:text-green-600" title="Restore">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => handleDeleteOne(r.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                totalPages={totalHuddlePages}
                total={total}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Drawer with Log + Edit tabs */}
      {editing && (() => {
        const drawerLocked = editing.id ? !canUpdate : !canCreate;
        return (
        <RightPanel
          open
          onClose={() => setEditing(null)}
          size="sm"
          title="Meeting Details"
          subtitle={editing.id ? "Edit record" : "Create new record"}
          footer={
            editing.tab === "edit" ? (
              // Column wrapper pins the server-error banner directly above
              // the Cancel/Submit row, visible without scrolling.
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
            ) : null
          }
        >
          {(
            <>
              {drawerLocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Read-only — your role doesn&apos;t grant {editing.id ? "update" : "create"} access on Daily Huddle.
                </div>
              )}
              <fieldset disabled={drawerLocked} className={`space-y-4 ${drawerLocked ? "opacity-70" : ""}`}>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Date <span className="text-red-500">*</span></label>
                  <input type="date" value={editing.form.meetingDate}
                    onChange={e => setEditing({ ...editing, form: { ...editing.form, meetingDate: e.target.value } })}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Call Status</label>
                  <select value={editing.form.callStatus} onChange={e => updateStatus(e.target.value as Status)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client Name <span className="text-red-500">*</span></label>
                  <select value={editing.form.clientId} disabled={!!editing.id}
                    onChange={e => setEditing({ ...editing, form: { ...editing.form, clientId: e.target.value, absentClientMemberIds: [] } })}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50">
                    <option value="">Select…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Absent Members</label>
                  {!editing.form.clientId ? (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Select a client first.</p>
                  ) : clientMemberOptions.length === 0 ? (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This client has no members — add them in Client Master.</p>
                  ) : (
                    <UserMultiPicker
                      values={editing.form.absentClientMemberIds}
                      onChange={(ids) => setEditing({ ...editing, form: { ...editing.form, absentClientMemberIds: ids } })}
                      users={clientMemberOptions}
                      placeholder="Select members…"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Actual Start Time {isHeld && <span className="text-red-500">*</span>}</label>
                  <input
                    type="time"
                    disabled={!isHeld}
                    value={editing.form.actualStartTime}
                    onChange={e => {
                      const v = e.target.value;
                      setEditing({
                        ...editing,
                        form: {
                          ...editing.form,
                          actualStartTime: v,
                          // Clear end-time if it would now be <= start so the user
                          // must re-pick a valid (greater) value.
                          actualEndTime:
                            editing.form.actualEndTime && v && editing.form.actualEndTime <= v
                              ? ""
                              : editing.form.actualEndTime,
                        },
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Actual End Time {isHeld && <span className="text-red-500">*</span>}</label>
                  <input
                    type="time"
                    disabled={!isHeld || !editing.form.actualStartTime}
                    // Native browser validation: minutes earlier than start are
                    // greyed out / blocked by the browser's time picker.
                    min={editing.form.actualStartTime || undefined}
                    value={editing.form.actualEndTime}
                    onChange={e => {
                      const v = e.target.value;
                      // Belt-and-braces: if a value sneaks past `min` (some
                      // browsers allow typing) reject it on commit.
                      if (
                        editing.form.actualStartTime &&
                        v &&
                        v <= editing.form.actualStartTime
                      ) {
                        return;
                      }
                      setEditing({ ...editing, form: { ...editing.form, actualEndTime: v } });
                    }}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Yesterday&apos;s Achievements</label>
                  <Segmented
                    value={editing.form.yesterdaysAchievements ? "yes" : "no"}
                    onChange={v => setEditing({ ...editing, form: { ...editing.form, yesterdaysAchievements: v === "yes" } })}
                    options={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]}
                    disabled={!isHeld}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Today&apos;s Priority</label>
                  <Segmented
                    value={editing.form.todaysPriority ? "yes" : "no"}
                    onChange={v => setEditing({ ...editing, form: { ...editing.form, todaysPriority: v === "yes" } })}
                    options={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]}
                    disabled={!isHeld}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stuck Issues</label>
                <Segmented
                  value={editing.form.stuckIssues ? "yes" : "no"}
                  onChange={v => setEditing({ ...editing, form: { ...editing.form, stuckIssues: v === "yes" } })}
                  options={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]}
                  disabled={!isHeld}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes K&amp;P Dashboard</label>
                <textarea rows={4} value={editing.form.notesKPDashboard}
                  onChange={e => setEditing({ ...editing, form: { ...editing.form, notesKPDashboard: e.target.value } })}
                  placeholder="Enter K&P dashboard notes…"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Other Notes</label>
                <textarea rows={4} value={editing.form.otherNotes}
                  onChange={e => setEditing({ ...editing, form: { ...editing.form, otherNotes: e.target.value } })}
                  placeholder="Enter your content here…"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
              </div>
              </fieldset>
            </>
          )}
        </RightPanel>
        );
      })()}

      {/* Change History — full audit timeline (shared EntityChangeHistoryPanel) */}
      {logHuddle && (
        <DailyHuddleChangeHistoryPanel huddle={logHuddle} onClose={() => setLogHuddle(null)} />
      )}

      {/* Global Export — row-per-record over a meetingDate range (.xlsx / PDF) */}
      <GlobalExportModal
        open={globalExportOpen}
        onClose={() => setGlobalExportOpen(false)}
        title="Export Daily Huddle"
        columns={moduleColumns}
        defaultCheckedKeys={visibleColKeys}
        rangeMode="date"
        onExport={handleGlobalExport}
      />
      {exportError && (
        <div className="fixed bottom-4 right-4 z-[60] bg-red-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          {exportError}
        </div>
      )}

      {/* Metrics Report — aggregate per-client monthly ExcelJS report (preserved,
          reached via the "Metrics Report…" More-menu item). */}
      <ExportDataModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        clients={clients}
        defaultClientId={filterClientId || null}
        onSubmit={async ({ from, to, clientId }: ExportRange) => {
          if (!clientId) {
            notify.error("Please select a client to export.");
            return;
          }
          // Backend builds the XLSX (with header block, member counts,
          // and Notes columns). We just stream the blob and trigger a
          // browser download.
          const res = await fetch("/api/client-meetings/export/daily-detail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, from, to }),
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => null);
            notify.error(errJson?.error, { context: "daily huddle", fallback: "Couldn't export. Please try again." });
            return;
          }
          const blob = await res.blob();
          const disposition = res.headers.get("Content-Disposition") ?? "";
          const match = /filename="([^"]+)"/.exec(disposition);
          const filename = match?.[1] ?? `DailyHuddleExport_${from}_to_${to}.xlsx`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
