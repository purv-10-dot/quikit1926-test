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
import { useSession } from "next-auth/react";
import { useFilterContext } from "@/lib/context/FilterContext";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton,
  AddButton, EmptyState, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody,
  Segmented, FilterPicker, UserMultiPicker, Pagination, type ExportSelection,
} from "@quikit/ui";
import { Users, History, Clock, Search, Filter, Trash2, RotateCcw } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { toast } from "sonner";
import { runExport } from "@/lib/export/xlsx";
import { fmtAuditPayload, diffAuditPayload } from "@/lib/utils/auditLog";

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

interface AuditLogEntry {
  id: string; action: string;
  oldValue: unknown; newValue: unknown;
  changedByName: string; reason: string | null; createdAt: string;
}

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
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtWindow(s: string | null, e: string | null) {
  if (s && e) return `${s} – ${e}`;
  return "—";
}

export default function ClientsPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("ClientMaster");
  const { data: session } = useSession();
  const role = (session?.user as { membershipRole?: string } | undefined)?.membershipRole;
  const isAdmin = role === "owner" || role === "admin" || role === "super_admin" ||
    (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin === true;

  const { quarter } = useFilterContext();
  const { year } = useFilterContext();
  const currentWeek = useCurrentWeek(year, quarter);

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [viewTrash, setViewTrash] = useState(false);

  // Filter popover — Client name + Status.
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");

  // Hidden columns (local — tablePreferences enum doesn't include clients yet).
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);

  const [editing, setEditing] = useState<{ id: string | null; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logOpen, setLogOpen] = useState<{ id: string; name: string } | null>(null);
  const [logRows, setLogRows] = useState<AuditLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = viewTrash ? "?includeDeleted=true" : "";
      const [c, m] = await Promise.all([
        fetch(`/api/client-meetings/clients${qs}`).then(r => r.json()),
        fetch("/api/client-meetings/members").then(r => r.json()),
      ]);
      if (c.success) setRows(c.data);
      if (m.success) setMembers(m.data);
    } finally { setLoading(false); }
  }, [viewTrash]);

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
      if (filterClientId && r.id !== filterClientId) return false;
      if (filterStatus === "active"   && !r.isActive) return false;
      if (filterStatus === "inactive" &&  r.isActive) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !(r.description ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterClientId, filterStatus]);

  const activeFilterCount = (filterClientId ? 1 : 0) + (filterStatus ? 1 : 0);
  const clientOptions = useMemo(() => rows.map(r => ({ value: r.id, label: r.name })), [rows]);

  // Pagination — default 10 rows, options 10/20/30/50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [search, filterClientId, filterStatus, viewTrash, pageSize]);
  const pagedClients = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalClientPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Adapt ClientMember rows to UserMultiPicker's PickerUser shape
  // (UserMultiPicker expects firstName/lastName — we split on first space).
  const memberPickerOptions = useMemo(() => members.map(m => {
    const parts = m.name.trim().split(/\s+/);
    return {
      id: m.id,
      firstName: parts[0] ?? m.name,
      lastName: parts.slice(1).join(" "),
      email: m.email,
    };
  }), [members]);

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openCreate() {
    if (!isAdmin) return;
    setError("");
    setEditing({ id: null, form: { ...emptyForm } });
  }
  function openEdit(row: ClientRow) {
    setError("");
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

  async function openLog(row: ClientRow) {
    setLogOpen({ id: row.id, name: row.name });
    setLogLoading(true); setLogRows([]);
    try {
      const res = await fetch(`/api/client-meetings/clients/${row.id}/logs`);
      const json = await res.json();
      if (json.success) setLogRows(json.data);
    } finally { setLogLoading(false); }
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
      setEditing(null);
      await refresh();
    } finally { setSaving(false); }
  }

  async function handleBulkDelete() {
    if (!selected.size || !isAdmin) return;
    if (!confirm(`Delete ${selected.size} client${selected.size === 1 ? "" : "s"}?`)) return;
    await Promise.all([...selected].map(id => fetch(`/api/client-meetings/clients/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    refresh();
  }

  async function handleDeleteOne(id: string) {
    if (!isAdmin) return;
    if (!confirm("Delete this client?")) return;
    await fetch(`/api/client-meetings/clients/${id}`, { method: "DELETE" });
    refresh();
  }
  async function handleRestore(id: string) {
    await fetch(`/api/client-meetings/clients/${id}/restore`, { method: "POST" });
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
      // Fall back to per-row restore if bulk endpoint isn't available.
      await Promise.all([...selected].map(id => handleRestore(id)));
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
  const isHidden = (key: string) => hiddenCols.includes(key);

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
      pageRows: filtered,
      fetchFiltered: async () => filtered,
      fetchAll: async () => {
        const res = await fetch("/api/client-meetings/clients");
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
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{filtered.length} items</span>
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
            <input value={search} onChange={e => setSearch(e.target.value)}
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
            rowCounts={{ page: filtered.length, filtered: filtered.length, all: rows.length }}
            onExport={handleExport}
            defaultExportColumnKeys={visibleColKeys}
          />

          {canCreate && isAdmin && <AddButton onClick={openCreate}>Add New</AddButton>}
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
              icon={Users}
              title={search ? "No matches" : viewTrash ? "Trash is empty" : "Add your first client"}
              message={search ? "Try a different search term." : "Clients are the external organisations you run meeting rhythm for. Planned meeting windows power the Dashboard's punctuality and duration-followed metrics."}
              action={!search && !viewTrash && canCreate && isAdmin ? { label: "Add your first client", onClick: openCreate } : undefined}
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
                  {!isHidden("name")         && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Client Name</th>}
                  {!isHidden("teamMembers")  && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Team Members</th>}
                  {!isHidden("dailyWindow")  && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">D/H Window</th>}
                  {!isHidden("weeklyWindow") && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Weekly Window</th>}
                  {!isHidden("isActive")     && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Status</th>}
                  {!isHidden("description")  && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Description</th>}
                  {!isHidden("createdBy")    && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Created By</th>}
                  {!isHidden("updatedBy")    && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Updated By</th>}
                  {!isHidden("createdAt")    && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Created Date</th>}
                  {!isHidden("updatedAt")    && <th className="text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">Updated Date</th>}
                  <th className="w-10 px-3 py-3 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {pagedClients.map(r => (
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
                      <button onClick={() => openLog(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500" title="View audit log">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => openEdit(r)} className="text-blue-600 hover:underline font-medium">{r.displayId}</button>
                    </td>
                    {!isHidden("name") && <td className="px-3 py-3 font-medium text-gray-800">{r.name}</td>}
                    {!isHidden("teamMembers") && (
                      <td className="px-3 py-3 text-gray-600">
                        {r.teamMembers.length === 0 ? <span className="text-gray-300">—</span> : (
                          <span title={r.teamMembers.map(m => m.name).join(", ")}>
                            {r.teamMembers.slice(0, 3).map(m => m.name).join(", ")}
                            {r.teamMembers.length > 3 && ` +${r.teamMembers.length - 3}`}
                          </span>
                        )}
                      </td>
                    )}
                    {!isHidden("dailyWindow") && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtWindow(r.dailyStartTime, r.dailyEndTime)}</td>}
                    {!isHidden("weeklyWindow") && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtWindow(r.weeklyStartTime, r.weeklyEndTime)}</td>}
                    {!isHidden("isActive") && (
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {r.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    )}
                    {!isHidden("description") && (
                      <td className="px-3 py-3 text-gray-600 max-w-xs truncate" title={r.description ?? ""}>
                        {r.description ?? <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {!isHidden("createdBy") && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                            {r.createdByInitials}
                          </span>
                          <span className="text-xs text-gray-700 whitespace-nowrap">{r.createdByName}</span>
                        </div>
                      </td>
                    )}
                    {!isHidden("updatedBy") && (
                      <td className="px-3 py-3">
                        {r.updatedByName ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                              {r.updatedByInitials}
                            </span>
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
                      {viewTrash && isAdmin ? (
                        <button onClick={() => handleRestore(r.id)} className="p-1 rounded hover:bg-green-50 text-gray-300 hover:text-green-600" title="Restore">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : isAdmin ? (
                        <button onClick={() => handleDeleteOne(r.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {filtered.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalClientPages}
                total={filtered.length}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
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
          }
        >
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>}
          {drawerLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              Read-only — your role doesn&apos;t grant {editing.id ? "update" : "create"} access on Client Master.
            </div>
          )}

          <fieldset disabled={drawerLocked} className={`space-y-4 ${drawerLocked ? "opacity-70" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Members <span className="text-red-500">*</span></label>
            {memberPickerOptions.length === 0 ? (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No Client Members yet. Add some in Meeting Rhythm → Client Members first.
              </p>
            ) : (
              <UserMultiPicker
                values={editing.form.teamMemberIds}
                onChange={(ids) => setEditing({ ...editing, form: { ...editing.form, teamMemberIds: ids } })}
                users={memberPickerOptions}
                placeholder="Select members…"
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

      {/* Audit log modal */}
      {logOpen && (
        <Modal open onOpenChange={(o) => { if (!o) setLogOpen(null); }}>
          <ModalContent className="max-w-2xl">
            <ModalHeader>
              <ModalTitle>Audit Log — {logOpen.name}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              {logLoading ? (
                <p className="text-xs text-gray-400">Loading…</p>
              ) : logRows.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No changes recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {logRows.map(entry => (
                    <li key={entry.id} className="border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          entry.action === "CREATE" ? "bg-green-100 text-green-700"
                          : entry.action === "UPDATE" ? "bg-blue-100 text-blue-700"
                          : entry.action === "DELETE" ? "bg-red-100 text-red-700"
                          : entry.action === "RESTORE" ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                        }`}>{entry.action}</span>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500">
                          <span className="font-medium">{entry.changedByName}</span>
                          <span>·</span>
                          <span>{fmtDateTime(entry.createdAt)}</span>
                        </div>
                      </div>
                      {entry.action === "UPDATE" && !!entry.oldValue && !!entry.newValue && (() => {
                        const diffs = diffAuditPayload(entry.oldValue, entry.newValue);
                        return diffs.length ? (
                          <div className="text-[11px] space-y-0.5 mt-1">
                            {diffs.map(({ key, oldValue, newValue }) => (
                              <p key={key} className="text-gray-600">
                                <span className="font-medium">{key}:</span>{" "}
                                <span className="line-through text-gray-400">{JSON.stringify(oldValue ?? "")}</span>
                                <span className="mx-1 text-gray-400">→</span>
                                <span className="text-gray-800">{JSON.stringify(newValue ?? "")}</span>
                              </p>
                            ))}
                          </div>
                        ) : null;
                      })()}
                      {entry.action === "CREATE" && !!entry.newValue && (() => {
                        const text = fmtAuditPayload(entry.newValue);
                        return text ? (
                          <div className="text-[11px] text-gray-600 mt-1 break-words">
                            Created with: {text}
                          </div>
                        ) : null;
                      })()}
                      {entry.action === "DELETE" && (
                        <div className="text-[11px] text-gray-600 mt-1 italic">Client deleted.</div>
                      )}
                      {entry.action === "RESTORE" && (
                        <div className="text-[11px] text-gray-600 mt-1 italic">Client restored from trash.</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
}
