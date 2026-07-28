"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import Link from "next/link";
import { User, Users as UsersIcon, Crown, Star, Search, Building2, Shield, LayoutGrid, GitBranch, X, ZoomIn, ZoomOut, Maximize2, Minimize2, FileText, List, MapPin, Mail, Download, Plus, Grid3X3, Upload, ChevronUp, ChevronDown, UserPlus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Trash2, Unlink } from "lucide-react";
import { clsx } from "clsx";
import { withBasePath } from "@/lib/utils/base-path";
import { exportCsv as writeCsv } from "@/lib/utils/csv";
import { EMPLOYEE_EXPORT_COLUMNS, type EmployeeExportRow } from "@/lib/data/employee-export";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface OrgEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  profilePhoto: string | null;
  status: string;
  reportingManagerId: string | null;
  roleId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
}

interface RoleOption { id: string; code: string; name: string; priority?: number }
interface DeptOption { id: string; name: string }

// Levenshtein distance — number of insertions/deletions/substitutions to transform a → b
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev, dp[j - 1], dp[j]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Fuzzy match: substring OR each query token within edit distance ≤ threshold of any haystack token.
// Threshold scales with token length: 1 typo for ≤4 chars, 2 for 5-7, 3 for 8+.
function fuzzyMatch(query: string, haystack: string): boolean {
  if (!query) return true;
  if (haystack.includes(query)) return true;
  const qTokens = query.split(/\s+/).filter(Boolean);
  const hTokens = haystack.split(/\s+/).filter(Boolean);
  return qTokens.every((qt) => {
    const threshold = qt.length <= 4 ? 1 : qt.length <= 7 ? 2 : 3;
    return hTokens.some((ht) => {
      if (ht.includes(qt)) return true;
      // Compare against prefix of haystack token if longer (handle partial typed names).
      const ref = ht.length > qt.length ? ht.slice(0, qt.length + threshold) : ht;
      return levenshtein(qt, ref) <= threshold;
    });
  });
}

const DEPT_COLORS: Record<string, string> = {
  engineering: "from-[#86efac] to-[#16a34a]",
  "human resources": "from-sky-400 to-green-500",
  hr: "from-sky-400 to-green-500",
  finance: "from-emerald-400 to-green-500",
  sales: "from-amber-400 to-orange-500",
  marketing: "from-purple-400 to-green-500",
  operations: "from-cyan-400 to-sky-500",
  default: "from-gray-300 to-gray-400",
};

type NodeRole = "leader" | "self" | "report" | "hod";
type ViewMode = "chain" | "full" | "hods";

function OrgCard({ node, role, dimmed, totalCount, directCount, collapsed, onToggle, editMode, dragging, dropTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onDetach }: {
  node: OrgEmployee; role: NodeRole; dimmed?: boolean; roleLabel?: string | null;
  totalCount?: number; directCount?: number; collapsed?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
  editMode?: boolean; dragging?: boolean; dropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDetach?: () => void;
}) {
  const ring =
    role === "self" ? "ring-2 ring-[#22c55e] border-[#bbf7d0]" :
    role === "leader" ? "border-amber-200" :
    role === "hod" ? "border-emerald-200" : "border-gray-200";

  const deptColorName = node.department?.name?.toLowerCase() ?? "default";
  const footerBg: Record<string, string> = {
    engineering: "bg-green-100 text-green-900",
    "human resources": "bg-sky-100 text-sky-900",
    hr: "bg-sky-100 text-sky-900",
    finance: "bg-emerald-100 text-emerald-900",
    sales: "bg-amber-100 text-amber-900",
    marketing: "bg-emerald-100 text-emerald-900",
    operations: "bg-cyan-100 text-cyan-900",
    default: "bg-slate-100 text-slate-700",
  };
  const footerCls = footerBg[deptColorName] ?? footerBg.default;

  const cardCls = clsx(
    "relative block w-60 rounded-lg border bg-white shadow-sm hover:shadow-md transition group overflow-hidden",
    ring,
    dimmed && "opacity-30 grayscale hover:opacity-60",
    editMode && "cursor-grab",
    dragging && "opacity-40",
    dropTarget && "ring-2 ring-emerald-500 ring-offset-2 shadow-lg scale-[1.02]",
  );

  const cardChildren = (
    <>
      <div className="p-4 text-center">
        <div className="relative inline-block">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden mx-auto">
            {node.profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={withBasePath(node.profilePhoto)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <User size={26} />
              </div>
            )}
          </div>
          {role === "leader" && <Crown size={14} className="absolute -top-1 -right-1 text-amber-500 bg-white rounded-full p-0.5" />}
          {role === "self" && <Star size={14} className="absolute -top-1 -right-1 text-[#22c55e] fill-[#22c55e] bg-white rounded-full p-0.5" />}
          {role === "hod" && <Building2 size={14} className="absolute -top-1 -right-1 text-emerald-600 bg-white rounded-full p-0.5" />}
        </div>
        <p className="mt-2 text-[13px] font-semibold text-slate-900 truncate group-hover:text-[#22c55e]">
          {node.firstName} {node.lastName}
        </p>
        <p className="text-xs text-slate-600 truncate">
          {node.designation?.title ?? node.jobTitle ?? "—"}
        </p>
      </div>
      {node.department?.name && (
        <div className={clsx("py-1.5 text-center text-[11px] font-medium uppercase tracking-wide", footerCls)}>
          {node.department.name}
        </div>
      )}
      {typeof directCount === "number" && directCount > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 bg-white/80">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1" title="Total subordinates">
              <UsersIcon size={12} className="text-slate-500" />
              <span className="font-semibold">{totalCount ?? directCount}</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Direct reports">
              <UserPlus size={12} className="text-slate-500" />
              <span className="font-semibold">{directCount}</span>
            </span>
          </div>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title={collapsed ? "Expand" : "Collapse"}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#16a34a] transition"
            >
              {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          )}
        </div>
      )}
    </>
  );

  if (editMode) {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={cardCls}
      >
        {onDetach && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDetach(); }}
            title="Remove from manager (make top-level)"
            className="absolute top-1.5 right-1.5 z-10 w-6 h-6 inline-flex items-center justify-center rounded-md bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 shadow-sm"
          >
            <Unlink size={13} />
          </button>
        )}
        {cardChildren}
      </div>
    );
  }

  return (
    <Link href={`/employees/${node.id}`} className={cardCls}>
      {cardChildren}
    </Link>
  );
}

function Connector({ thick }: { thick?: boolean }) {
  return <div className={clsx(thick ? "w-px h-5 bg-gray-400" : "w-px h-4 bg-gray-300")} />;
}

export default function OrgChartPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const { hasPermission, isLoading: permsLoading, navKeys, permissions } = useDashboardConfig();
  // People directory access. The Directory + Org Chart data API
  // (/api/v1/hrms/org-chart) requires the full-read `hrms.employee.read` and
  // returns the whole company tree (it isn't team/self-scoped), so the tab gate
  // must match — otherwise read_team/org.read users get an empty Directory.
  // Users without it may still view the Org Chart, but must not reach the
  // Directory tab.
  const canViewDirectory = hasPermission("hrms.employee.read");

  // Per-tab navigation allow-list (mirrors the sidebar). Default-allow — a role
  // with no configured navKeys (or super-admin) sees both tabs. Legacy
  // "people.directory" key grants the whole page for older role configs.
  const isSuper = permissions.includes("*");
  const navSet = new Set(navKeys);
  const navConfigured = !isSuper && navSet.size > 0;
  const legacyAll = navSet.has("people.directory");
  const navAllowed = (key: string) => !navConfigured || legacyAll || navSet.has(key);
  const showDirectory = canViewDirectory && navAllowed("people.directory.list");
  const showOrgChart = navAllowed("people.directory.orgchart");
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const reassignMut = useMutation({
    mutationFn: ({ employeeId, managerId }: { employeeId: string; managerId: string | null }) =>
      api.patch(`/api/v1/hrms/employees/${employeeId}`, { reportingManagerId: managerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chart"] }),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setDragError(e.message),
  });

  const [topTab, setTopTab] = useState<"directory" | "orgchart">(() =>
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "orgchart")
      ? "orgchart"
      : "directory",
  );
  // Once permissions load, keep the active tab within what the user can see.
  useEffect(() => {
    if (permsLoading) return;
    if (topTab === "directory" && !showDirectory && showOrgChart) setTopTab("orgchart");
    else if (topTab === "orgchart" && !showOrgChart && showDirectory) setTopTab("directory");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, topTab, showDirectory, showOrgChart]);
  const [directoryView, setDirectoryView] = useState<"list" | "grid">("list");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("chain");
  const [departmentId, setDepartmentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const zoomIn = () => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const zoomReset = () => setZoom(1);
  const toggleFullscreen = async () => {
    const el = document.querySelector(".org-chart-container") as HTMLElement | null;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  };

  if (typeof document !== "undefined") {
    document.onfullscreenchange = () => setIsFullscreen(Boolean(document.fullscreenElement));
  }
  const [isPanning, setIsPanning] = useState(false);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => setCollapsedNodes((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const onPanStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [data-no-pan]")) return;
    const scrollEl = e.currentTarget;
    const startX = e.pageX;
    const startY = e.pageY;
    const startScrollLeft = scrollEl.scrollLeft;
    const startScrollTop = scrollEl.scrollTop;
    setIsPanning(true);

    const onMove = (ev: MouseEvent) => {
      scrollEl.scrollLeft = startScrollLeft - (ev.pageX - startX);
      scrollEl.scrollTop = startScrollTop - (ev.pageY - startY);
    };
    const onUp = () => {
      setIsPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const exportPdf = () => {
    document.body.classList.add("org-chart-print");
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("org-chart-print"), 500);
    }, 50);
  };

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<OrgEmployee>("/api/v1/hrms/employees/me"),
  });
  const me = meData?.data;

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["org-chart-snapshot"],
    queryFn: () =>
      api.get<{ employees: OrgEmployee[]; refreshedAt: string; employeeCount: number }>(
        "/api/v1/hrms/org-chart",
      ),
  });
  // Both the Org Chart and the Directory show Active employees only, so the
  // "People" count matches across tabs. Non-active people (pre-boarding, on
  // notice, suspended, etc.) are excluded from the tree.
  const all = useMemo(() => (allData?.data?.employees ?? []).filter((e) => e.status === "Active"), [allData]);
  const activeEmployees = all;

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const departments = deptData?.data ?? [];

  const { data: rolesData } = useQuery({
    queryKey: ["settings", "roles"],
    queryFn: () => api.get<RoleOption[]>("/api/v1/hrms/settings/roles"),
  });
  const roles = rolesData?.data ?? [];
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);

  // Managers available for the "Reporting Manager" filter — anyone who is
  // someone's reporting manager, sorted by name.
  const managerOptions = useMemo(() => {
    const managerIds = new Set(all.map((e) => e.reportingManagerId).filter(Boolean) as string[]);
    return all
      .filter((e) => managerIds.has(e.id))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [all]);

  const matchesFilters = (e: OrgEmployee): boolean => {
    if (departmentId && e.department?.id !== departmentId) return false;
    if (roleId && e.roleId !== roleId) return false;
    if (reportingManagerId && e.reportingManagerId !== reportingManagerId) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase().trim();
      const hay = `${e.firstName} ${e.lastName} ${e.employeeCode} ${e.jobTitle ?? ""} ${e.workEmail ?? ""} ${e.personalEmail ?? ""} ${e.department?.name ?? ""}`.toLowerCase();
      if (!fuzzyMatch(q, hay)) return false;
    }
    return true;
  };
  const hasActiveFilter = Boolean(departmentId || roleId || reportingManagerId || search || statusFilter);
  const clearFilters = () => { setDepartmentId(""); setRoleId(""); setReportingManagerId(""); setSearch(""); setStatusFilter(""); };
  // Live count of employees matching the current filters (drives the filter-bar badge).
  const filteredCount = hasActiveFilter ? all.filter(matchesFilters).length : all.length;

  const exportDirectory = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // The on-screen chart data carries only a few fields — for the download we
      // pull the complete, export-grade record (`fields=full`) straight from the
      // API and emit the shared employee column set (same columns as the People
      // directory export).
      //
      // Match the CSV to exactly what the table shows: compute the visible set
      // with the SAME client-side filters the table uses (department, role,
      // reporting manager, and fuzzy search over name/code/title/email/dept) via
      // `matchesFilters` on `all`, then keep only those export rows — joined by
      // employeeCode (unique per org). Don't rely on the server `search` param,
      // which uses plain contains, not the table's fuzzyMatch.
      const matchedCodes = hasActiveFilter
        ? new Set(all.filter(matchesFilters).map((e) => e.employeeCode).filter(Boolean) as string[])
        : null;

      const base = new URLSearchParams({ limit: "100", fields: "full", status: "Active" });
      const rows: EmployeeExportRow[] = [];
      let p = 1;
      for (;;) {
        base.set("page", String(p));
        const res = await api.get<EmployeeExportRow[]>(`/api/v1/hrms/employees?${base.toString()}`);
        rows.push(...res.data);
        const pages = res.meta?.totalPages ?? 1;
        if (p >= pages || res.data.length === 0) break;
        p += 1;
      }
      const filtered = matchedCodes
        ? rows.filter((e) => e.employeeCode != null && matchedCodes.has(e.employeeCode))
        : rows;
      writeCsv("people-directory", EMPLOYEE_EXPORT_COLUMNS, filtered);
    } finally {
      setExporting(false);
    }
  };

  // ─── chain data (default view) ──
  const leaders: OrgEmployee[] = [];
  if (me) {
    let cursor: OrgEmployee | undefined = me.reportingManagerId ? byId.get(me.reportingManagerId) : undefined;
    const seen = new Set<string>([me.id]);
    while (cursor && !seen.has(cursor.id)) {
      leaders.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.reportingManagerId ? byId.get(cursor.reportingManagerId) : undefined;
    }
  }
  const reportsOf = (id: string): OrgEmployee[] => all.filter((e) => e.reportingManagerId === id);

  // Cycle prevention — is targetId a descendant of sourceId (would create a loop)?
  const isDescendant = (sourceId: string, targetId: string): boolean => {
    const stack = [sourceId];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const kids = reportsOf(cur);
      for (const k of kids) {
        if (k.id === targetId) return true;
        stack.push(k.id);
      }
    }
    return false;
  };

  const handleDrop = (sourceId: string, targetId: string | null) => {
    setDragError(null);
    setDraggingId(null);
    setDropTargetId(null);
    if (!sourceId) return;
    if (sourceId === targetId) return;
    if (targetId && isDescendant(sourceId, targetId)) {
      setDragError("Cannot drop onto own subordinate (would create cycle).");
      return;
    }
    const src = byId.get(sourceId);
    if (!src) return;
    if (src.reportingManagerId === targetId) return; // No change
    reassignMut.mutate({ employeeId: sourceId, managerId: targetId });
  };

  // Explicit "remove from manager" — the drop-on-empty-space gesture exists but
  // is undiscoverable, so each card gets an unlink button in edit mode.
  const handleDetach = async (emp: OrgEmployee) => {
    const ok = await dialog.confirm({
      title: "Remove from manager?",
      description: `${emp.firstName} ${emp.lastName} will no longer report to anyone and becomes a top-level node. You can reassign them later by dragging onto a manager.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    handleDrop(emp.id, null);
  };
  const childrenByMgr = useMemo(() => {
    const m = new Map<string, OrgEmployee[]>();
    for (const e of all) {
      if (!e.reportingManagerId) continue;
      const arr = m.get(e.reportingManagerId) ?? [];
      arr.push(e);
      m.set(e.reportingManagerId, arr);
    }
    return m;
  }, [all]);
  const subtreeCount = useMemo(() => {
    const memo = new Map<string, number>();
    const walk = (id: string, stack: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!;
      if (stack.has(id)) return 0; // cycle guard
      stack.add(id);
      const kids = childrenByMgr.get(id) ?? [];
      let n = 0;
      for (const k of kids) {
        if (k.id === id || stack.has(k.id)) continue;
        n += 1 + walk(k.id, stack);
      }
      stack.delete(id);
      memo.set(id, n);
      return n;
    };
    for (const e of all) walk(e.id, new Set());
    return memo;
  }, [all, childrenByMgr]);
  const directReports = me ? reportsOf(me.id) : [];
  const reportsByParent = new Map<string, OrgEmployee[]>();
  if (me) {
    for (const r of directReports) {
      const subs = reportsOf(r.id);
      if (subs.length) reportsByParent.set(r.id, subs);
    }
  }

  // ─── full-tree data ──
  const roots = all.filter((e) => !e.reportingManagerId);

  // ─── HODs data ──
  // HOD = head of department: highest node within a department whose manager is in a different dept (or no manager)
  const hodsByDept = new Map<string, OrgEmployee[]>();
  for (const e of all) {
    if (!e.department?.id) continue;
    const mgr = e.reportingManagerId ? byId.get(e.reportingManagerId) : null;
    const isHod = !mgr || mgr.department?.id !== e.department.id;
    if (isHod) {
      const list = hodsByDept.get(e.department.id) ?? [];
      list.push(e);
      hodsByDept.set(e.department.id, list);
    }
  }

  const isLoading = meLoading || allLoading;

  // Recursive tree renderer for full view
  function renderTree(node: OrgEmployee, level: number, ancestors: Set<string> = new Set()): React.ReactNode {
    if (ancestors.has(node.id) || level > 50) return null;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(node.id);
    const children = reportsOf(node.id).filter((c) => !nextAncestors.has(c.id));
    const dimmed = hasActiveFilter && !matchesFilters(node);
    const roleLabel = node.roleId ? roleById.get(node.roleId)?.name ?? null : null;
    const isCollapsed = collapsedNodes.has(node.id);
    const directCount = children.length;
    const totalCount = subtreeCount.get(node.id) ?? 0;
    return (
      <div key={node.id} className="relative flex flex-col items-center">
        {level > 0 && <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-px h-4 bg-gray-300" />}
        <OrgCard
          node={node}
          role={level === 0 ? "leader" : "report"}
          dimmed={dimmed}
          roleLabel={roleLabel}
          directCount={directCount}
          totalCount={totalCount}
          collapsed={isCollapsed}
          onToggle={directCount > 0 ? (e) => { e.preventDefault(); e.stopPropagation(); toggleCollapse(node.id); } : undefined}
          editMode={editMode}
          dragging={editMode && draggingId === node.id}
          dropTarget={editMode && dropTargetId === node.id && draggingId !== null && draggingId !== node.id}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", node.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(node.id);
          }}
          onDragOver={(e) => {
            if (!draggingId || draggingId === node.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dropTargetId !== node.id) setDropTargetId(node.id);
          }}
          onDragLeave={() => {
            if (dropTargetId === node.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const sourceId = e.dataTransfer.getData("text/plain");
            handleDrop(sourceId, node.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDropTargetId(null);
          }}
          onDetach={editMode && node.reportingManagerId ? () => handleDetach(node) : undefined}
        />
        {children.length > 0 && !isCollapsed && (
          <>
            <Connector />
            <div className={clsx("relative flex items-start justify-center pt-4", level === 0 ? "gap-6" : "gap-4")}>
              {children.length > 1 && (
                <div className="absolute top-0 left-6 right-6 h-px bg-gray-300" />
              )}
              {children.map((c) => renderTree(c, level + 1, nextAncestors))}
            </div>
          </>
        )}
      </div>
    );
  }

  const title =
    viewMode === "chain" ? "My Reporting Chain" :
    viewMode === "full" ? "Full Organization Chart" :
    "Heads of Department";

  const subtitle = (() => {
    if (!me && !all.length) return "Loading...";
    if (viewMode === "chain" && me) {
      const skip = Array.from(reportsByParent.values()).reduce((s, v) => s + v.length, 0);
      return `${leaders.length} leader${leaders.length !== 1 ? "s" : ""} · ${directReports.length} direct report${directReports.length !== 1 ? "s" : ""}${skip ? ` · ${skip} skip-level` : ""}`;
    }
    if (viewMode === "full") {
      return `${all.length} employees · ${roots.length} root${roots.length !== 1 ? "s" : ""}`;
    }
    if (viewMode === "hods") {
      const count = Array.from(hodsByDept.values()).reduce((s, v) => s + v.length, 0);
      return `${hodsByDept.size} department${hodsByDept.size !== 1 ? "s" : ""} · ${count} HOD${count !== 1 ? "s" : ""}`;
    }
    return "";
  })();

  if (!permsLoading && !showDirectory && !showOrgChart) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500 text-xs">
        You don&apos;t have access to this section.
      </div>
    );
  }

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div />
        {topTab === "directory" ? (
          <div className="flex items-center gap-2">
            <Link
              href="/employees/bulk-import"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 transition"
            >
              <Upload size={13} /> Bulk Import
            </Link>
            <button
              onClick={exportDirectory}
              disabled={exporting || all.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-50"
            >
              <Download size={13} /> {exporting ? "Exporting..." : "Export"}
            </button>
            <Link
              href="/employees/new"
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition"
            >
              <Plus size={13} /> Add Employee
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-amber-600"><Crown size={12} /> Leader</span>
            <span className="flex items-center gap-1 text-[#22c55e]"><Star size={12} className="fill-[#22c55e]" /> You</span>
            <span className="flex items-center gap-1 text-gray-500"><UsersIcon size={12} /> Report</span>
          </div>
        )}
      </div>

      {/* Top tabs — Directory vs Org Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-1 inline-flex items-center gap-1 mb-3 shadow-sm">
        {showDirectory && (
        <button
          onClick={() => setTopTab("directory")}
          className={clsx(
            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
            topTab === "directory"
              ? "bg-green-600 text-white shadow-sm"
              : "text-gray-600 hover:text-[#22c55e] hover:bg-green-50",
          )}
        >
          <List size={14} /> Directory
          <span className={clsx("ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold",
            topTab === "directory" ? "bg-white/20" : "bg-gray-100 text-gray-500")}>
            {activeEmployees.length}
          </span>
        </button>
        )}
        {showOrgChart && (
        <button
          onClick={() => setTopTab("orgchart")}
          className={clsx(
            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
            topTab === "orgchart"
              ? "bg-green-600 text-white shadow-sm"
              : "text-gray-600 hover:text-[#22c55e] hover:bg-green-50",
          )}
        >
          <GitBranch size={14} /> Org Chart
        </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4 space-y-2">
        {/* View mode tabs — only for Org Chart */}
        {topTab === "orgchart" && (
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { value: "chain" as const, label: "My Chain", icon: <GitBranch size={12} /> },
            { value: "full" as const, label: "Full Org", icon: <LayoutGrid size={12} /> },
          ].map((m) => {
            const active = viewMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setViewMode(m.value)}
                className={clsx(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition",
                  active
                    ? "bg-green-600 border-green-600 text-white shadow-sm"
                    : "bg-white border-[var(--border)] text-gray-600 hover:border-[#166534]/40 hover:text-[#166534]",
                )}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
        )}

        {/* Filter inputs */}
        <div className={clsx("flex items-center gap-2 flex-wrap", topTab === "orgchart" ? "pt-1 border-t border-gray-100" : "")}>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, code, title…"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>

          <div className="min-w-[180px]">
            <Select
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="All departments"
              size="sm"
              options={[
                { value: "", label: "All departments" },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div className="min-w-[160px]">
            <Select
              value={roleId}
              onChange={setRoleId}
              placeholder="All roles"
              size="sm"
              options={[
                { value: "", label: "All roles" },
                ...roles.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>

          <div className="min-w-[180px]">
            <Select
              value={reportingManagerId}
              onChange={setReportingManagerId}
              placeholder="All managers"
              size="sm"
              options={[
                { value: "", label: "All managers" },
                ...managerOptions.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` })),
              ]}
            />
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#bbf7d0] text-[11px] font-semibold whitespace-nowrap">
            {filteredCount} {filteredCount === 1 ? "result" : "results"}
            {hasActiveFilter && <span className="text-[#16a34a]/70 font-normal">of {all.length}</span>}
          </span>

          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-md"
            >
              <X size={12} /> Clear
            </button>
          )}

          {topTab === "directory" && (
            <div className="ml-auto flex border border-[var(--border)] rounded-lg overflow-hidden shrink-0">
              <button
                onClick={() => setDirectoryView("list")}
                title="List view"
                className={clsx("p-1.5 transition", directoryView === "list" ? "bg-[#dcfce7] text-[#22c55e]" : "text-gray-400 hover:bg-gray-50")}
              >
                <List size={12} />
              </button>
              <button
                onClick={() => setDirectoryView("grid")}
                title="Grid view"
                className={clsx("p-1.5 transition", directoryView === "grid" ? "bg-[#dcfce7] text-[#22c55e]" : "text-gray-400 hover:bg-gray-50")}
              >
                <Grid3X3 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {topTab === "directory" && showDirectory ? (
        <DirectoryView
          employees={activeEmployees}
          hasActiveFilter={hasActiveFilter}
          matchesFilters={matchesFilters}
          roleById={roleById}
          view={directoryView}
        />
      ) : (
      <div className="relative bg-gradient-to-b from-gray-50 to-white rounded-lg shadow-sm border border-gray-200 overflow-hidden org-chart-container">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-md p-1 print:hidden org-chart-toolbar">
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            title="Zoom out"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={zoomReset}
            title="Reset zoom"
            className="px-2 h-8 inline-flex items-center justify-center rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-[#22c55e] min-w-[48px] transition"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 2}
            title="Zoom in"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ZoomIn size={12} />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-[#22c55e] transition"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button
            onClick={exportPdf}
            title="Export to PDF"
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 text-xs font-semibold transition"
          >
            <FileText size={13} /> PDF
          </button>
        </div>

        <div className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm print:hidden">
          <UsersIcon size={13} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Total: <span className="text-[#22c55e]">{all.length}</span></span>
        </div>

        <div
          onMouseDown={editMode ? undefined : onPanStart}
          className={clsx(
            // pt-16 clears the floating toolbar + total badge pinned at top-4.
            "overflow-auto p-4 pt-16 org-chart-scroll select-none",
            editMode ? "cursor-default" : isPanning ? "cursor-grabbing" : "cursor-grab",
            isFullscreen ? "max-h-screen h-screen bg-white" : "min-h-[78vh] max-h-[85vh]",
          )}
        >
          <div className="flex justify-center" style={{ minWidth: "100%", width: "max-content" }}>
          <div
            className="org-chart-canvas"
            style={editMode ? undefined : { zoom }}
          >
        {isLoading ? (
          <SkeletonCards count={6} />
        ) : viewMode === "chain" ? (
          !me ? (
            <div className="text-center py-12 text-gray-500">Could not resolve current employee.</div>
          ) : (
            <div className="flex flex-col items-center">
              {leaders.map((l) => (
                <div key={l.id} className="flex flex-col items-center">
                  <OrgCard node={l} role="leader" dimmed={hasActiveFilter && !matchesFilters(l)} roleLabel={l.roleId ? roleById.get(l.roleId)?.name ?? null : null} />
                  <Connector />
                </div>
              ))}
              <OrgCard node={me} role="self" roleLabel={me.roleId ? roleById.get(me.roleId)?.name ?? null : null} />
              {directReports.length > 0 ? (
                <>
                  <Connector />
                  <div className="relative flex items-start justify-center gap-6 pt-4">
                    {directReports.length > 1 && (
                      <div className="absolute top-0 left-6 right-6 h-px bg-gray-300" />
                    )}
                    {directReports.map((r) => {
                      const subs = reportsByParent.get(r.id) ?? [];
                      const isCol = collapsedNodes.has(r.id);
                      const rTotal = subtreeCount.get(r.id) ?? subs.length;
                      return (
                        <div key={r.id} className="relative flex flex-col items-center">
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-px h-4 bg-gray-300" />
                          <OrgCard
                            node={r}
                            role="report"
                            dimmed={hasActiveFilter && !matchesFilters(r)}
                            roleLabel={r.roleId ? roleById.get(r.roleId)?.name ?? null : null}
                            directCount={subs.length}
                            totalCount={rTotal}
                            collapsed={isCol}
                            onToggle={subs.length > 0 ? (e) => { e.preventDefault(); e.stopPropagation(); toggleCollapse(r.id); } : undefined}
                          />
                          {subs.length > 0 && !isCol && (
                            <>
                              <Connector />
                              <div className="relative flex items-start justify-center gap-3 pt-3">
                                {subs.length > 1 && <div className="absolute top-0 left-4 right-4 h-px bg-gray-200" />}
                                {subs.map((s) => (
                                  <div key={s.id} className="relative flex flex-col items-center">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3 bg-gray-200" />
                                    <OrgCard
                                      node={s}
                                      role="report"
                                      dimmed={hasActiveFilter && !matchesFilters(s)}
                                      roleLabel={s.roleId ? roleById.get(s.roleId)?.name ?? null : null}
                                    />
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-xs text-gray-400">No direct reports</p>
              )}
            </div>
          )
        ) : viewMode === "full" ? (
          roots.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No organization root found.</div>
          ) : (
            <>
              {editMode && (
                <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center justify-between">
                  <span>Drag any employee onto a manager to reassign, or use the unlink icon on a card to remove its reporting manager. Cycles blocked automatically.</span>
                  <button onClick={() => { setEditMode(false); setDragError(null); }} className="font-semibold hover:underline">Done</button>
                </div>
              )}
              {dragError && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  {dragError}
                </div>
              )}
              {reassignMut.isPending && (
                <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                  Saving reassignment...
                </div>
              )}
              <div
                onDragOver={(e) => { if (editMode && draggingId) { e.preventDefault(); } }}
                onDrop={(e) => {
                  if (!editMode || !draggingId) return;
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData("text/plain");
                  if (sourceId && (e.target as HTMLElement) === e.currentTarget) {
                    handleDrop(sourceId, null);
                  }
                }}
                className={clsx("flex items-start justify-center gap-5 flex-wrap p-2 rounded", editMode && "min-h-[400px] bg-emerald-50/30 ring-1 ring-dashed ring-emerald-200")}
              >
                {roots.map((r) => renderTree(r, 0))}
              </div>
            </>
          )
        ) : (
          // HODs grouped by department
          hodsByDept.size === 0 ? (
            <div className="text-center py-12 text-gray-500">No department heads found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from(hodsByDept.entries()).map(([deptId, hods]) => {
                const dept = hods[0].department!;
                const deptColor = DEPT_COLORS[dept.name.toLowerCase()] ?? DEPT_COLORS.default;
                const deptMembers = all.filter((e) => e.department?.id === deptId).length;
                return (
                  <div key={deptId} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <div className={clsx("w-8 h-8 rounded-md bg-gradient-to-br flex items-center justify-center text-white", deptColor)}>
                        <Building2 size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{dept.name}</p>
                        <p className="text-[10px] text-gray-500">{deptMembers} member{deptMembers !== 1 ? "s" : ""} · {hods.length} HOD{hods.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {hods.map((h) => (
                        <OrgCard
                          key={h.id}
                          node={h}
                          role="hod"
                          dimmed={hasActiveFilter && !matchesFilters(h)}
                          roleLabel={h.roleId ? roleById.get(h.roleId)?.name ?? null : null}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
          </div>
          </div>
        </div>
      </div>
      )}

      <style jsx global>{`
        html,
        body,
        main,
        .org-chart-scroll {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar,
        main::-webkit-scrollbar,
        .org-chart-scroll::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }

        @media print {
          body.org-chart-print > * { visibility: hidden !important; }
          body.org-chart-print .org-chart-container,
          body.org-chart-print .org-chart-container * { visibility: visible !important; }
          body.org-chart-print .org-chart-container {
            position: absolute !important;
            top: 0; left: 0; right: 0;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          body.org-chart-print .org-chart-toolbar { display: none !important; }
          body.org-chart-print .org-chart-scroll {
            overflow: visible !important;
            max-height: none !important;
          }
          body.org-chart-print .org-chart-canvas {
            transform: scale(0.9) !important;
            transform-origin: top left !important;
          }
          @page { size: A3 landscape; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

function DirectoryView({ employees, hasActiveFilter, matchesFilters, roleById, view }: {
  employees: OrgEmployee[];
  hasActiveFilter: boolean;
  matchesFilters: (e: OrgEmployee) => boolean;
  roleById: Map<string, RoleOption>;
  view: "list" | "grid";
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  // Delete disabled for now (checkbox + per-row + bulk delete all hidden).
  // Re-enable via permissions when needed.
  const canDelete = false;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hardDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deleted: number; skipped: number; errors: Array<{ id: string; error: string }> }>("/api/v1/hrms/employees/bulk-hard-delete", { employeeIds: ids }),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: ["org-chart-snapshot"] });
      const snapshot = qc.getQueryData<{ success: boolean; data: { employees: OrgEmployee[]; refreshedAt: string; employeeCount: number } }>(["org-chart-snapshot"]);
      const idSet = new Set(ids);
      qc.setQueryData<typeof snapshot>(["org-chart-snapshot"], (old) =>
        old
          ? {
              ...old,
              data: {
                ...old.data,
                employees: old.data.employees.filter((emp) => !idSet.has(emp.id)),
                employeeCount: Math.max(0, old.data.employeeCount - ids.filter((id) => old.data.employees.some((e) => e.id === id)).length),
              },
            }
          : old,
      );
      return { snapshot };
    },
    onSuccess: (res) => {
      const { deleted, skipped, errors } = res.data;
      if (errors?.length) {
        toast.error(`${deleted} deleted, ${errors.length} failed`, errors.map((e) => e.error).join("; "));
      } else {
        toast.success(`${deleted} employee${deleted === 1 ? "" : "s"} permanently deleted`, skipped > 0 ? `${skipped} skipped` : "All related data removed.");
      }
      setSelected(new Set());
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(["org-chart-snapshot"], ctx.snapshot);
    },
    onSettled: () => {
      setDeletingId(null);
      qc.invalidateQueries({ queryKey: ["org-chart-snapshot"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["org-chart"] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const confirmDelete = async (e: OrgEmployee) => {
    const ok = await dialog.confirm({
      title: "Permanently delete employee?",
      description: `${e.firstName} ${e.lastName} and ALL related data (salary, payslips, leaves, attendance, loans, tasks, docs, tickets, etc.) will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete forever",
      variant: "danger",
    });
    if (ok) {
      setDeletingId(e.id);
      hardDeleteMut.mutate([e.id]);
    }
  };

  const confirmBulkDelete = async () => {
    if (selected.size === 0) return;
    const ok = await dialog.confirm({
      title: `Permanently delete ${selected.size} employee${selected.size === 1 ? "" : "s"}?`,
      description: "All selected employees and their related data (salary, payslips, leaves, attendance, loans, tasks, docs, tickets, etc.) will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete forever",
      variant: "danger",
    });
    if (ok) hardDeleteMut.mutate(Array.from(selected));
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shown = hasActiveFilter ? employees.filter(matchesFilters) : employees;
  const byId = new Map(employees.map((e) => [e.id, e]));

  // ─── Pagination ────────────────────────────────────
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const total = shown.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Reset to page 1 when filters/view shrink the list past current page
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = shown.slice(startIdx, endIdx);

  const Pager = () => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 flex-wrap">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>
          Showing <span className="font-semibold">{total === 0 ? 0 : startIdx + 1}-{endIdx}</span> of{" "}
          <span className="font-semibold">{total}</span>
        </span>
        <span className="text-slate-300">|</span>
        <label className="flex items-center gap-1">
          Rows:
          <Select
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(parseInt(v, 10));
              setPage(1);
            }}
            size="sm"
            className="min-w-[72px]"
            options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="First page"
        >
          <ChevronsLeft size={12} />
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous"
        >
          <ChevronLeft size={12} />
        </button>
        <span className="px-2 text-xs text-slate-700">
          Page <span className="font-semibold">{page}</span> of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next"
        >
          <ChevronRight size={12} />
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Last page"
        >
          <ChevronsRight size={12} />
        </button>
      </div>
    </div>
  );

  if (shown.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        <UsersIcon size={36} className="mx-auto mb-2 text-gray-300" />
        <p className="text-xs font-medium">No employees match the current filters.</p>
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-4 pb-3">
          <p className="text-[13px] font-semibold text-gray-800">
            Total: <span className="text-[#22c55e]">{shown.length}</span>
            {hasActiveFilter && <span className="text-xs text-gray-400 ml-2 font-normal">({employees.length} before filters)</span>}
          </p>
          {selected.size > 0 && canDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-700">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              >Clear</button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                disabled={hardDeleteMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
              >
                <Trash2 size={12} /> {hardDeleteMut.isPending ? "Deleting..." : `Delete ${selected.size}`}
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-4 pb-4">
          {pageRows.map((e) => {
            const deptColor = e.department?.name
              ? DEPT_COLORS[e.department.name.toLowerCase()] ?? DEPT_COLORS.default
              : DEPT_COLORS.default;
            const roleLabel = e.roleId ? roleById.get(e.roleId)?.name ?? null : null;
            return (
              <div key={e.id} className={clsx("group relative rounded-lg border bg-white shadow-sm hover:shadow-md transition overflow-hidden", selected.has(e.id) ? "border-[#22c55e] ring-1 ring-[#22c55e]/30" : "border-gray-200 hover:border-[#bbf7d0]")}>
                <div className={clsx("h-1 bg-gradient-to-r", deptColor)} />
                {canDelete && (
                  <>
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className={clsx("absolute top-2 left-2 z-10 rounded text-[#22c55e] transition", selected.has(e.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                      title="Select"
                    />
                    <button
                      type="button"
                      disabled={deletingId === e.id}
                      onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); confirmDelete(e); }}
                      className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/80 backdrop-blur text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition disabled:opacity-40 border border-gray-100"
                      title="Delete employee"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
                <Link href={`/employees/${e.id}`} className="block p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                      {e.profilePhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={withBasePath(e.profilePhoto)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400"><User size={14} /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-[#22c55e]">{e.firstName} {e.lastName}</p>
                      <p className="text-[11px] text-gray-500 truncate">{e.employeeCode}</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                    <p className="truncate">{e.designation?.title ?? e.jobTitle ?? "—"}</p>
                    <p className="text-gray-400 truncate">{e.department?.name ?? "—"}{roleLabel ? ` · ${roleLabel}` : ""}</p>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
        <Pager />
      </div>
    );
  }

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((e) => selected.has(e.id));
  const someOnPageSelected = pageRows.some((e) => selected.has(e.id));
  const togglePageAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) pageRows.forEach((e) => next.delete(e.id));
      else pageRows.forEach((e) => next.add(e.id));
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-800">
          Total: <span className="text-[#22c55e]">{shown.length}</span>
          {hasActiveFilter && <span className="text-xs text-gray-400 ml-2 font-normal">({employees.length} before filters)</span>}
        </p>
        {selected.size > 0 && canDelete && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-700">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >Clear</button>
            <button
              type="button"
              onClick={confirmBulkDelete}
              disabled={hardDeleteMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-md text-xs font-semibold"
            >
              <Trash2 size={12} /> {hardDeleteMut.isPending ? "Deleting..." : `Delete ${selected.size}`}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
              {canDelete && (
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected; }}
                    onChange={togglePageAll}
                    className="rounded text-[#22c55e]"
                  />
                </th>
              )}
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Employee Name</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Department</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Job Title</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Reports to</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Employee Code</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Role</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e, i) => {
              const roleLabel = e.roleId ? roleById.get(e.roleId)?.name ?? null : null;
              const manager = e.reportingManagerId ? byId.get(e.reportingManagerId) : null;
              return (
                <tr key={e.id} className={clsx("row-stagger border-b border-slate-100 dark:border-slate-800 transition", selected.has(e.id) ? "bg-green-50/40 dark:bg-emerald-900/25" : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40")} style={{ ["--i" as never]: Math.min(i, 10) }}>
                  {canDelete && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        className="rounded text-[#22c55e]"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/employees/${e.id}`} className="flex items-center gap-2.5 group">
                      <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                        {e.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={withBasePath(e.profilePhoto)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <User size={14} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 truncate group-hover:text-[#22c55e]">{e.firstName} {e.lastName}</p>
                        <p className="text-[11px] text-slate-500 truncate">{e.designation?.title ?? e.jobTitle ?? "—"}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">{e.department?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 truncate">{e.designation?.title ?? e.jobTitle ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {manager ? (
                      <Link href={`/employees/${manager.id}`} className="flex items-center gap-2 hover:text-[#22c55e]">
                        <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                          {manager.profilePhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={withBasePath(manager.profilePhoto)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={10} /></div>
                          )}
                        </div>
                        <span className="text-xs text-slate-700 truncate">{manager.firstName} {manager.lastName}</span>
                      </Link>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{e.employeeCode}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{roleLabel ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}
