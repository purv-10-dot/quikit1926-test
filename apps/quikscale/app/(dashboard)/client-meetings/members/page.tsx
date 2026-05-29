"use client";

/**
 * Client Members — flat CRUD entity (spec §3 + image 1).
 *
 * Columns: checkbox, log, ID, Name, Email, Created/Updated By, Created/Updated
 * Date. Add/Edit drawer carries just Name + Email. Log icon opens audit
 * history (CREATE / UPDATE / DELETE).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFilterContext } from "@/lib/context/FilterContext";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import {
  RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton,
  AddButton, EmptyState, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody,
  FilterPicker, Pagination, ColMenu, type ExportSelection,
} from "@quikit/ui";
import { Users, History, Clock, Search, Filter, Trash2, RotateCcw } from "lucide-react";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort } from "@/lib/store";
import { useColumnResize, ResizeHandle } from "@/lib/hooks/useColumnResize";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";

// Defaults for the drag-to-resize widths. Users can drag any column to any
// width ≥ 48px (the global MIN_COL_WIDTH in useColumnResize) and the value
// persists to UserTablePreference.colWidths.
const COL_WIDTHS_DEFAULT: Record<string, number> = {
  log: 56,
  id: 56,
  name: 200,
  email: 280,
  createdBy: 160,
  updatedBy: 160,
  createdAt: 120,
  updatedAt: 120,
};
import { toast } from "sonner";
import { runExport } from "@/lib/export/xlsx";
import { fmtAuditPayload, diffAuditPayload } from "@/lib/utils/auditLog";

interface MemberRow {
  id: string;
  displayId: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string; createdByInitials: string;
  updatedBy: string | null;
  updatedByName: string | null; updatedByInitials: string | null;
}

interface AuditLogEntry {
  id: string; action: string;
  oldValue: unknown; newValue: unknown;
  changedByName: string; reason: string | null; createdAt: string;
}

const emptyForm = { name: "", email: "" };

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ClientMembersPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("ClientMember");
  const { year, quarter } = useFilterContext();
  const currentWeek = useCurrentWeek(year, quarter);

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // View Trash toggle — when true, GET returns only soft-deleted rows.
  const [viewTrash, setViewTrash] = useState(false);

  // Filter popover state. "Name" filter = pick one member to narrow the list.
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterMemberId, setFilterMemberId] = useState<string>("");

  // Server-persisted column preferences (frozen / hidden / sort) via
  // UserTablePreference table (app_quikscale schema). Replaces the previous
  // local-state approach so users get the same prefs across devices.
  const {
    hiddenCols,
    setHiddenCols,
    frozenCol,
    setFrozenCol,
    hideCol,
  } = useTablePrefs("clientMembers");
  const { sortBy, sortOrder, setSort } = useTableSort("clientMembers");
  const { getColWidth, startResize } = useColumnResize("clientMembers", COL_WIDTHS_DEFAULT);

  const [editing, setEditing] = useState<{ id: string | null; form: typeof emptyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logOpen, setLogOpen] = useState<{ id: string; name: string } | null>(null);
  const [logRows, setLogRows] = useState<AuditLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Forward sort to the server — the route's whitelist defaults to
      // `createdAt asc` when sortBy is empty so users still see the legacy
      // ordering before they pick a column.
      const params = new URLSearchParams();
      if (viewTrash) params.set("includeDeleted", "true");
      if (sortBy) params.set("sortBy", sortBy);
      if (sortBy && sortOrder) params.set("sortOrder", sortOrder);
      const qs = params.toString();
      const res = await fetch(`/api/client-meetings/members${qs ? "?" + qs : ""}`);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } finally { setLoading(false); }
  }, [viewTrash, sortBy, sortOrder]);

  useEffect(() => { refresh(); }, [refresh]);

  // Outside-click for Filter popover.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterMemberId && r.id !== filterMemberId) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterMemberId]);

  // Name filter: every member becomes a selectable option.
  const nameOptions = useMemo(
    () => rows.map(r => ({ value: r.id, label: r.name })),
    [rows],
  );

  const activeFilterCount = filterMemberId ? 1 : 0;

  // Pagination — default 10 rows, options 10/20/30/50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [search, filterMemberId, viewTrash, pageSize]);
  const pagedMembers = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalMemberPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Column metadata for Manage Columns + Export.
  const moduleColumns = [
    { key: "name",        label: "Name" },
    { key: "email",       label: "Email" },
    { key: "createdBy",   label: "Created By" },
    { key: "updatedBy",   label: "Updated By" },
    { key: "createdAt",   label: "Created Date" },
    { key: "updatedAt",   label: "Updated Date" },
  ];
  const visibleColKeys = moduleColumns.filter(c => !hiddenCols.includes(c.key)).map(c => c.key);
  const isHidden = (key: string) => hiddenCols.includes(key);

  // Export handler — pulls rows per scope, formats via runExport (xlsx).
  async function handleExport(sel: ExportSelection) {
    const columns = moduleColumns
      .filter(c => sel.columnKeys.includes(c.key))
      .map(c => ({
        key: c.key, label: c.label,
        value: (r: MemberRow) => {
          switch (c.key) {
            case "name":      return r.name;
            case "email":     return r.email;
            case "createdBy": return r.createdByName;
            case "updatedBy": return r.updatedByName ?? "";
            case "createdAt": return fmtDateShort(r.createdAt);
            case "updatedAt": return fmtDateShort(r.updatedAt);
            default: return "";
          }
        },
      }));
    await runExport<MemberRow>({
      selection: sel, columns,
      pageRows: filtered,
      fetchFiltered: async () => filtered,
      fetchAll: async () => {
        const res = await fetch("/api/client-meetings/members");
        const j = await res.json();
        return j.success ? (j.data as MemberRow[]) : [];
      },
      filename: `ClientMembers${viewTrash ? "-Trash" : ""}`,
    });
  }

  async function handleRestore(id: string) {
    await fetch(`/api/client-meetings/members/${id}/restore`, { method: "POST" });
    refresh();
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function openCreate() { setError(""); setEditing({ id: null, form: { ...emptyForm } }); }
  function openEdit(row: MemberRow) { setError(""); setEditing({ id: row.id, form: { name: row.name, email: row.email } }); }

  async function openLog(row: MemberRow) {
    setLogOpen({ id: row.id, name: row.name });
    setLogLoading(true); setLogRows([]);
    try {
      const res = await fetch(`/api/client-meetings/members/${row.id}/logs`);
      const json = await res.json();
      if (json.success) setLogRows(json.data);
    } finally { setLogLoading(false); }
  }

  async function handleSubmit() {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) { setError("Name is required"); return; }
    if (!f.email.trim()) { setError("Email is required"); return; }

    setSaving(true); setError("");
    try {
      const url = editing.id ? `/api/client-meetings/members/${editing.id}` : "/api/client-meetings/members";
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name.trim(), email: f.email.trim() }) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to save"); return; }
      setEditing(null);
      await refresh();
    } finally { setSaving(false); }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} member${selected.size === 1 ? "" : "s"}?`)) return;
    await Promise.all([...selected].map(id => fetch(`/api/client-meetings/members/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    refresh();
  }

  async function handleBulkRestore() {
    if (!selected.size) return;
    await fetch(`/api/client-meetings/members/bulk-restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    refresh();
  }

  async function handleDeleteOne(id: string) {
    if (!confirm("Delete this member?")) return;
    await fetch(`/api/client-meetings/members/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Single-row page header — matches Individual KPI layout exactly. */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Client Members</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {filtered.length} items
          </span>
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

          {/* Filter popover */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : "Filter"}
            </button>
            {showFilter && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Name</p>
                  <FilterPicker
                    value={filterMemberId}
                    onChange={setFilterMemberId}
                    options={nameOptions}
                    allLabel="All members"
                  />
                </div>
                {filterMemberId && (
                  <button onClick={() => setFilterMemberId("")}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* More menu — Manage Columns, Trash, Export (shared component). */}
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

          {canCreate && <AddButton onClick={openCreate}>Add New</AddButton>}
        </div>
      </div>

      {/* Trash banner — shown while viewing deleted rows. */}
      {viewTrash && (
        <div className="px-6 py-2 flex-shrink-0">
          <TrashBanner count={filtered.length} onExit={() => setViewTrash(false)} />
        </div>
      )}

      {/* Table area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Users}
              title={search ? "No matches" : "Add your first member"}
              message={search ? "Try a different search term." : "Client members are the people you run daily huddles and weekly meetings with. Add their name and email to get started."}
              action={!search && canCreate ? { label: "Add your first member", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col min-h-0">
            <HorizontalScroller className="flex-1">
            <table
              className="text-xs bg-white border-separate border-spacing-0"
              style={{ width: "100%", minWidth: "max-content", tableLayout: "fixed" }}>
              <thead className="sticky top-0 bg-accent-50 z-10">
                <tr>
                  <th className="sticky z-[35] px-3 py-3 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                    <label
                      onClickCapture={(e) => {
                        if (!canDelete) {
                          e.preventDefault();
                          e.stopPropagation();
                          toast.error("You don't have permission to delete");
                        }
                      }}
                    >
                      <input type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll} disabled={!canDelete}
                        className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                    </label>
                  </th>
                  <th className="sticky z-[35] text-left px-3 py-3 font-semibold text-gray-600 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 40, width: 56, minWidth: 56, maxWidth: 56 }}>Log</th>
                  <th className="sticky z-[35] text-left px-3 py-3 font-semibold text-gray-600 bg-accent-50 border-b border-r border-gray-200"
                      style={{ left: 96, width: 56, minWidth: 56, maxWidth: 56 }}>ID</th>
                  {!isHidden("name") && (
                    <th data-col-key="name"
                        style={{ width: getColWidth("name") }}
                        className={`group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200 ${frozenCol === "name" ? "sticky left-[152px] z-[15] bg-accent-50" : ""}`}>
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Name{sortBy === "name" && (sortOrder === "asc" ? " ↑" : " ↓")}</span>
                        <ColMenu colKey="name"
                          onSort={(d) => setSort({ sortBy: "name", sortOrder: d })}
                          onFreeze={() => setFrozenCol(frozenCol === "name" ? null : "name")}
                          onHide={() => hideCol("name")}
                          frozen={frozenCol === "name"} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("name", e.clientX)} />
                    </th>
                  )}
                  {!isHidden("email") && (
                    <th data-col-key="email"
                        style={{ width: getColWidth("email") }}
                        className={`group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200 ${frozenCol === "email" ? "sticky left-[152px] z-[15] bg-accent-50" : ""}`}>
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Email{sortBy === "email" && (sortOrder === "asc" ? " ↑" : " ↓")}</span>
                        <ColMenu colKey="email"
                          onSort={(d) => setSort({ sortBy: "email", sortOrder: d })}
                          onFreeze={() => setFrozenCol(frozenCol === "email" ? null : "email")}
                          onHide={() => hideCol("email")}
                          frozen={frozenCol === "email"} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("email", e.clientX)} />
                    </th>
                  )}
                  {!isHidden("createdBy") && (
                    <th data-col-key="createdBy"
                        style={{ width: getColWidth("createdBy") }}
                        className="group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Created By</span>
                        <ColMenu colKey="createdBy"
                          onFreeze={() => setFrozenCol(frozenCol === "createdBy" ? null : "createdBy")}
                          onHide={() => hideCol("createdBy")}
                          frozen={frozenCol === "createdBy"} showSort={false} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("createdBy", e.clientX)} />
                    </th>
                  )}
                  {!isHidden("updatedBy") && (
                    <th data-col-key="updatedBy"
                        style={{ width: getColWidth("updatedBy") }}
                        className="group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Updated By</span>
                        <ColMenu colKey="updatedBy"
                          onFreeze={() => setFrozenCol(frozenCol === "updatedBy" ? null : "updatedBy")}
                          onHide={() => hideCol("updatedBy")}
                          frozen={frozenCol === "updatedBy"} showSort={false} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("updatedBy", e.clientX)} />
                    </th>
                  )}
                  {!isHidden("createdAt") && (
                    <th data-col-key="createdAt"
                        style={{ width: getColWidth("createdAt") }}
                        className="group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Created Date{sortBy === "createdAt" && (sortOrder === "asc" ? " ↑" : " ↓")}</span>
                        <ColMenu colKey="createdAt"
                          onSort={(d) => setSort({ sortBy: "createdAt", sortOrder: d })}
                          onFreeze={() => setFrozenCol(frozenCol === "createdAt" ? null : "createdAt")}
                          onHide={() => hideCol("createdAt")}
                          frozen={frozenCol === "createdAt"} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("createdAt", e.clientX)} />
                    </th>
                  )}
                  {!isHidden("updatedAt") && (
                    <th data-col-key="updatedAt"
                        style={{ width: getColWidth("updatedAt") }}
                        className="group relative text-left px-3 py-3 font-semibold text-gray-600 border-b border-gray-200">
                      <div className="flex items-center gap-1">
                        <span className="flex-1">Updated Date{sortBy === "updatedAt" && (sortOrder === "asc" ? " ↑" : " ↓")}</span>
                        <ColMenu colKey="updatedAt"
                          onSort={(d) => setSort({ sortBy: "updatedAt", sortOrder: d })}
                          onFreeze={() => setFrozenCol(frozenCol === "updatedAt" ? null : "updatedAt")}
                          onHide={() => hideCol("updatedAt")}
                          frozen={frozenCol === "updatedAt"} />
                      </div>
                      <ResizeHandle onStart={(e) => startResize("updatedAt", e.clientX)} />
                    </th>
                  )}
                  <th className="w-10 px-3 py-3 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map(r => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-blue-50/30 ${selected.has(r.id) ? "bg-blue-50/60" : ""}`}>
                    <td className="sticky z-[15] bg-white px-3 py-3 text-center border-b border-r border-gray-100"
                        style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
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
                    <td className="sticky z-[15] bg-white px-3 py-3 border-b border-r border-gray-100"
                        style={{ left: 40, width: 56, minWidth: 56, maxWidth: 56 }}>
                      <button onClick={() => openLog(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500" title="View audit log">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="sticky z-[15] bg-white px-3 py-3 border-b border-r border-gray-100"
                        style={{ left: 96, width: 56, minWidth: 56, maxWidth: 56 }}>
                      <button onClick={() => openEdit(r)} className="text-blue-600 hover:underline font-medium">{r.displayId}</button>
                    </td>
                    {/* Data cells — explicit width matches the <th> so column-resize sticks.
                        `overflow-hidden` prevents wide content from blowing past the fixed
                        column width set by table-layout: fixed. */}
                    {!isHidden("name") && (
                      <td style={{ width: getColWidth("name") }} className="px-3 py-3 text-gray-800 overflow-hidden text-ellipsis whitespace-nowrap">
                        {r.name}
                      </td>
                    )}
                    {!isHidden("email") && (
                      <td style={{ width: getColWidth("email") }} className="px-3 py-3 overflow-hidden">
                        <a href={`mailto:${r.email}`} className="text-xs text-gray-700 hover:text-blue-500 hover:underline whitespace-nowrap text-ellipsis overflow-hidden block">
                          {r.email}
                        </a>
                      </td>
                    )}
                    {!isHidden("createdBy") && (
                      <td style={{ width: getColWidth("createdBy") }} className="px-3 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                            {r.createdByInitials}
                          </span>
                          <span className="text-xs text-gray-700 whitespace-nowrap text-ellipsis overflow-hidden">{r.createdByName}</span>
                        </div>
                      </td>
                    )}
                    {!isHidden("updatedBy") && (
                      <td style={{ width: getColWidth("updatedBy") }} className="px-3 py-3 overflow-hidden">
                        {r.updatedByName ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0">
                              {r.updatedByInitials}
                            </span>
                            <span className="text-xs text-gray-700 whitespace-nowrap text-ellipsis overflow-hidden">{r.updatedByName}</span>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {!isHidden("createdAt") && (
                      <td style={{ width: getColWidth("createdAt") }} className="px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden">
                        <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3 text-gray-400" /> {fmtDateShort(r.createdAt)}</span>
                      </td>
                    )}
                    {!isHidden("updatedAt") && (
                      <td style={{ width: getColWidth("updatedAt") }} className="px-3 py-3 text-gray-600 whitespace-nowrap overflow-hidden">
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
            </HorizontalScroller>
            {filtered.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalMemberPages}
                total={filtered.length}
                limit={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </div>
        )}
      </div>

      {/* Add/Edit drawer */}
      {editing && (() => {
        const drawerLocked = editing.id ? !canUpdate : !canCreate;
        return (
        <RightPanel
          open
          onClose={() => setEditing(null)}
          size="sm"
          title="Client Members"
          subtitle={editing.id ? "Edit record" : "Create new record"}
          footer={
            // Column wrapper pins the server-error banner above the Cancel/
            // Submit row so it stays visible on long forms without scrolling.
            <div className="flex flex-col gap-2 w-full">
              <FormErrorBanner message={error} />
              <RightPanelFooter>
                <RightPanelCancelButton onClick={() => setEditing(null)} />
                {!drawerLocked && (
                  <RightPanelSubmitButton
                    onClick={handleSubmit} saving={saving}
                    icon={editing.id ? "check" : "plus"}
                    label={editing.id ? "Submit" : "Submit"}
                  />
                )}
              </RightPanelFooter>
            </div>
          }
        >
          {drawerLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              Read-only — your role doesn&apos;t grant {editing.id ? "update" : "create"} access on Client Members.
            </div>
          )}
          <fieldset disabled={drawerLocked} className={`space-y-4 ${drawerLocked ? "opacity-70" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={editing.form.name}
              onChange={e => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={editing.form.email}
              onChange={e => setEditing({ ...editing, form: { ...editing.form, email: e.target.value } })}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          </fieldset>
        </RightPanel>
        );
      })()}

      {/* Audit log modal — matches Individual KPI pattern. */}
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
                                <span className="line-through text-gray-400">{String(oldValue ?? "")}</span>
                                <span className="mx-1 text-gray-400">→</span>
                                <span className="text-gray-800">{String(newValue ?? "")}</span>
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
                        <div className="text-[11px] text-gray-600 mt-1 italic">Member deleted.</div>
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
