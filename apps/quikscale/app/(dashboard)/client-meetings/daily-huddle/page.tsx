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
} from "@quikit/ui";
import { Calendar, History, Clock, Search, Filter, Trash2, RotateCcw } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { toast } from "sonner";
import { runExport } from "@/lib/export/xlsx";
import { fmtAuditPayload, fmtFriendlyAuditEntry } from "@/lib/utils/auditLog";
import { ExportDataModal, type ExportRange } from "@/components/client-meetings/ExportDataModal";

type Status = "HELD" | "NOT_HELD" | "CALL_CANCELLED_BY_CLIENT";
const STATUS_OPTS: Array<{ value: Status; label: string }> = [
  { value: "HELD", label: "Held" },
  { value: "NOT_HELD", label: "Not Held" },
  { value: "CALL_CANCELLED_BY_CLIENT", label: "Cancelled by Client" },
];

interface ClientOpt { id: string; name: string }
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

interface AuditLogEntry {
  id: string; action: string;
  oldValue: unknown; newValue: unknown;
  changedByName: string; createdAt: string;
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
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function statusBadge(s: Status) {
  return s === "HELD" ? "bg-green-100 text-green-700"
       : s === "NOT_HELD" ? "bg-red-100 text-red-700"
       : "bg-amber-100 text-amber-700";
}
function statusLabel(s: Status) { return STATUS_OPTS.find(o => o.value === s)?.label ?? s; }

export default function DailyHuddlePage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("DailyHuddle");
  const { year, quarter } = useFilterContext();
  const currentWeek = useCurrentWeek(year, quarter);

  const [rows, setRows] = useState<HuddleRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [viewTrash, setViewTrash] = useState(false);
  // New From / To / Client export modal — replaces the legacy column
  // selection ExportModal that ModuleMoreActions opens by default.
  const [exportOpen, setExportOpen] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");

  const [hiddenCols, setHiddenCols] = useState<string[]>([]);

  const [editing, setEditing] = useState<{ id: string | null; tab: "log" | "edit"; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logRows, setLogRows] = useState<AuditLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qsParts: string[] = [];
      if (filterClientId) qsParts.push(`clientId=${filterClientId}`);
      if (viewTrash) qsParts.push("includeDeleted=true");
      const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
      const [h, c, m] = await Promise.all([
        fetch(`/api/client-meetings/daily-huddles${qs}`).then(r => r.json()),
        fetch("/api/client-meetings/clients").then(r => r.json()),
        fetch("/api/client-meetings/members").then(r => r.json()),
      ]);
      if (h.success) setRows(h.data);
      if (c.success) setClients(c.data);
      if (m.success) setMembers(m.data);
    } finally { setLoading(false); }
  }, [filterClientId, viewTrash]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterStatus && r.callStatus !== filterStatus) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!r.clientName.toLowerCase().includes(q)
            && !(r.notesKPDashboard ?? "").toLowerCase().includes(q)
            && !(r.otherNotes ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterStatus]);

  const activeFilterCount = (filterClientId ? 1 : 0) + (filterStatus ? 1 : 0);
  const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.name })), [clients]);

  // Pagination — default 10 rows, options 10/20/30/50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [search, filterClientId, filterStatus, viewTrash, pageSize]);
  const pagedHuddles = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalHuddlePages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Adapt ClientMember → PickerUser for UserMultiPicker (splits "name" on first space).
  const memberPickerOptions = useMemo(() => members.map(m => {
    const parts = m.name.trim().split(/\s+/);
    return { id: m.id, firstName: parts[0] ?? m.name, lastName: parts.slice(1).join(" "), email: m.email };
  }), [members]);

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openCreate() {
    setError("");
    setEditing({ id: null, tab: "edit", form: { ...emptyForm, clientId: filterClientId || clients[0]?.id || "" } });
  }

  async function openDetail(row: HuddleRow, tab: "log" | "edit") {
    setError(""); setLogRows([]);
    setEditing({
      id: row.id, tab,
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
    if (tab === "log") await loadLogs(row.id);
  }

  async function loadLogs(id: string) {
    setLogLoading(true);
    try {
      const res = await fetch(`/api/client-meetings/daily-huddles/${id}/logs`);
      const j = await res.json();
      if (j.success) setLogRows(j.data);
    } finally { setLogLoading(false); }
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
      setEditing(null);
      await refresh();
    } finally { setSaving(false); }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} huddle${selected.size === 1 ? "" : "s"}?`)) return;
    await Promise.all([...selected].map(id => fetch(`/api/client-meetings/daily-huddles/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    refresh();
  }

  async function handleDeleteOne(id: string) {
    if (!confirm("Delete this huddle?")) return;
    await fetch(`/api/client-meetings/daily-huddles/${id}`, { method: "DELETE" });
    refresh();
  }
  async function handleRestore(id: string) {
    await fetch(`/api/client-meetings/daily-huddles/${id}/restore`, { method: "POST" });
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
      selection: sel, columns, pageRows: filtered,
      fetchFiltered: async () => filtered,
      fetchAll: async () => {
        const r = await fetch("/api/client-meetings/daily-huddles").then(r => r.json());
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
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{filtered.length} items</span>
          {currentWeek !== null && (
            <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {quarter} · Week {currentWeek}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && canDelete && (
            <button onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </button>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
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
                    <option value="">All statuses</option>
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
            rowCounts={{ page: filtered.length, filtered: filtered.length, all: rows.length }}
            onExport={handleExport}
            defaultExportColumnKeys={visibleColKeys}
            // Override: open the From / To / Client modal instead of the
            // built-in column-selection one. handleExport is still passed so
            // the modal-driven submit (below) can re-use the column → cell
            // value mapping via runExport.
            onExportClick={() => setExportOpen(true)}
          />

          {canCreate && <AddButton onClick={openCreate} disabled={clients.length === 0}>Add New</AddButton>}
        </div>
      </div>

      {viewTrash && (
        <div className="px-6 py-2 flex-shrink-0">
          <TrashBanner count={filtered.length} onExit={() => setViewTrash(false)} />
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
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
            <div className="flex-1 overflow-auto min-h-0">
            <table className="min-w-full text-xs bg-white">
              <thead className="sticky top-0 bg-accent-50 z-10">
                <tr>
                  <th className="w-10 px-3 py-3 border-b border-gray-200">
                    <label
                      onClickCapture={(e) => {
                        if (!canDelete) {
                          e.preventDefault();
                          e.stopPropagation();
                          toast.error("You don't have permission to delete");
                        }
                      }}
                    >
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} disabled={!canDelete}
                        className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                    </label>
                  </th>
                  <th className="w-14 text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Log</th>
                  <th className="w-14 text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">ID</th>
                  {!isHidden("meetingDate")            && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Meeting Date</th>}
                  {!isHidden("client")                 && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Client</th>}
                  {!isHidden("callStatus")             && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Call Status</th>}
                  {!isHidden("absentMembers")          && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Absent Members</th>}
                  {!isHidden("actualStartTime")        && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Start</th>}
                  {!isHidden("actualEndTime")          && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">End</th>}
                  {!isHidden("yesterdaysAchievements") && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Yesterday</th>}
                  {!isHidden("todaysPriority")         && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Today</th>}
                  {!isHidden("stuckIssues")            && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Stuck</th>}
                  {!isHidden("createdBy")              && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Created By</th>}
                  {!isHidden("updatedBy")              && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Updated By</th>}
                  {!isHidden("createdAt")              && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Created Date</th>}
                  {!isHidden("updatedAt")              && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Updated Date</th>}
                  <th className="w-10 px-3 py-3 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {pagedHuddles.map(r => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-blue-50/30 ${selected.has(r.id) ? "bg-blue-50/60" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete) {
                            e.preventDefault();
                            e.stopPropagation();
                            toast.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} disabled={!canDelete}
                          className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => openDetail(r, "log")} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500" title="View log">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => openDetail(r, "edit")} className="text-blue-600 hover:underline font-medium">{r.displayId}</button>
                    </td>
                    {!isHidden("meetingDate") && <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmtDate(r.meetingDate)}</td>}
                    {!isHidden("client")      && <td className="px-3 py-3 text-gray-700">{r.clientName}</td>}
                    {!isHidden("callStatus")  && (
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(r.callStatus)}`}>
                          {statusLabel(r.callStatus)}
                        </span>
                      </td>
                    )}
                    {!isHidden("absentMembers") && (
                      <td className="px-3 py-3 text-gray-600">
                        {r.absentTeamMemberNames.length === 0 ? <span className="text-gray-300">—</span> : (
                          <span title={r.absentTeamMemberNames.join(", ")}>
                            {r.absentTeamMemberNames.slice(0, 2).join(", ")}
                            {r.absentTeamMemberNames.length > 2 && ` +${r.absentTeamMemberNames.length - 2}`}
                          </span>
                        )}
                      </td>
                    )}
                    {!isHidden("actualStartTime") && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{r.actualStartTime ?? <span className="text-gray-300">—</span>}</td>}
                    {!isHidden("actualEndTime")   && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{r.actualEndTime ?? <span className="text-gray-300">—</span>}</td>}
                    {!isHidden("yesterdaysAchievements") && <td className="px-3 py-3 text-gray-600">{r.yesterdaysAchievements ? "✓" : "✗"}</td>}
                    {!isHidden("todaysPriority")         && <td className="px-3 py-3 text-gray-600">{r.todaysPriority ? "✓" : "✗"}</td>}
                    {!isHidden("stuckIssues")            && <td className="px-3 py-3 text-gray-600">{r.stuckIssues ? "✓" : "✗"}</td>}
                    {!isHidden("createdBy") && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">{r.createdByInitials}</span>
                          <span className="text-xs text-gray-700 whitespace-nowrap">{r.createdByName}</span>
                        </div>
                      </td>
                    )}
                    {!isHidden("updatedBy") && (
                      <td className="px-3 py-3">
                        {r.updatedByName ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">{r.updatedByInitials}</span>
                            <span className="text-xs text-gray-700 whitespace-nowrap">{r.updatedByName}</span>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {!isHidden("createdAt") && (
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3 text-gray-400" /> {fmtDateShort(r.createdAt)}</span>
                      </td>
                    )}
                    {!isHidden("updatedAt") && (
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3 text-gray-400" /> {fmtDateShort(r.updatedAt)}</span>
                      </td>
                    )}
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
            </div>
            {filtered.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalHuddlePages}
                total={filtered.length}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
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
          tabs={editing.id ? [{ key: "log", label: "Log" }, { key: "edit", label: "Edit" }] : undefined}
          activeTab={editing.tab}
          onTabChange={(k) => {
            const next = k as "log" | "edit";
            setEditing({ ...editing, tab: next });
            if (next === "log" && editing.id) loadLogs(editing.id);
          }}
          footer={
            editing.tab === "edit" ? (
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
            ) : null
          }
        >
          {editing.tab === "log" ? (
            logLoading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : logRows.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No changes recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {logRows.map(entry => {
                  const nameById = (id: string): string | undefined => {
                    const client = clients.find((c) => c.id === id);
                    if (client) return client.name;
                    const member = members.find((m) => m.id === id);
                    if (member) return member.name;
                    return undefined;
                  };
                  const friendly = fmtFriendlyAuditEntry(
                    entry.action,
                    entry.newValue,
                    entry.oldValue,
                    { nameById },
                  );
                  return (
                    <li key={entry.id} className="border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          entry.action === "CREATE" ? "bg-green-100 text-green-700"
                          : entry.action === "UPDATE" ? "bg-blue-100 text-blue-700"
                          : entry.action === "DELETE" ? "bg-red-100 text-red-700"
                          : entry.action === "RESTORE" ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                        }`}>{entry.action}</span>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span className="font-medium">{entry.changedByName}</span>
                          <span>·</span>
                          <span>{fmtDateTime(entry.createdAt)}</span>
                        </div>
                      </div>
                      <div className="text-[12px] text-gray-800 font-medium mb-1">
                        {friendly.headline}
                      </div>
                      {friendly.rows.length > 0 && (
                        <table className="w-full mt-1 text-[11px] border-collapse">
                          <tbody>
                            {friendly.rows.map((r, i) => (
                              <tr key={i} className="border-t border-gray-200/70 first:border-t-0">
                                <td className="py-1 pr-3 text-gray-500 align-top whitespace-nowrap">{r.label}</td>
                                {r.oldValue !== undefined ? (
                                  <td className="py-1 text-gray-700 align-top">
                                    <span className="text-gray-400 line-through mr-1.5">{r.oldValue}</span>
                                    <span className="text-gray-400 mr-1.5">→</span>
                                    <span className="font-medium">{r.newValue}</span>
                                  </td>
                                ) : (
                                  <td className="py-1 text-gray-700 align-top break-words">{r.newValue}</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <>
              {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>}
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
                    onChange={e => setEditing({ ...editing, form: { ...editing.form, clientId: e.target.value } })}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50">
                    <option value="">Select…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Absent Members</label>
                  {memberPickerOptions.length === 0 ? (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No members — add in Client Members.</p>
                  ) : (
                    <UserMultiPicker
                      values={editing.form.absentClientMemberIds}
                      onChange={(ids) => setEditing({ ...editing, form: { ...editing.form, absentClientMemberIds: ids } })}
                      users={memberPickerOptions}
                      placeholder="Select members…"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Actual Start Time <span className="text-red-500">*</span></label>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Actual End Time <span className="text-red-500">*</span></label>
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

      {/* From / To / Client export modal — replaces the legacy
          column-selection modal as the Export Data action. */}
      <ExportDataModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        clients={clients}
        defaultClientId={filterClientId || null}
        onSubmit={async ({ from, to, clientId }: ExportRange) => {
          if (!clientId) {
            toast.error("Please select a client to export.");
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
            toast.error(errJson?.error ?? "Failed to export daily huddles");
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
