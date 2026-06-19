"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useRoles } from "@/lib/hooks/use-roles";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Modal } from "@/components/hrms/modal";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import {
  LifeBuoy,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Paperclip,
  X,
} from "lucide-react";
import { clsx } from "clsx";

interface DepartmentMini {
  id: string;
  name: string;
  code: string | null;
}

interface EmployeeMini {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}

interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "Open" | "InProgress" | "OnHold" | "Resolved" | "Closed" | "Reopened" | "Cancelled";
  source: string;
  createdAt: string;
  slaResolveDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolveBreachedAt: string | null;
  escalationLevel: number;
  department: DepartmentMini | null;
  category: { id: string; name: string; slug: string } | null;
  raisedBy: EmployeeMini;
  assignedTo: EmployeeMini | null;
  _count?: { comments: number; attachments: number };
}

interface Stats {
  counts: {
    total: number;
    open: number;
    inProgress: number;
    onHold: number;
    resolved: number;
    closed: number;
    reopened: number;
    urgent: number;
    overdueResolve: number;
    slaBreached: number;
    escalated: number;
  };
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-gray-100 text-gray-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  OnHold: "bg-gray-100 text-gray-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-gray-200 text-gray-600",
  Reopened: "bg-purple-100 text-purple-700",
  Cancelled: "bg-red-100 text-red-700",
};

function formatName(e: EmployeeMini | null): string {
  if (!e) return "Unassigned";
  return `${e.firstName} ${e.lastName}`;
}

function isOverdue(ticket: Ticket): boolean {
  if (!ticket.slaResolveDueAt) return false;
  if (["Resolved", "Closed", "Cancelled"].includes(ticket.status)) return false;
  return new Date(ticket.slaResolveDueAt).getTime() < Date.now();
}

interface AgeInfo {
  label: string;
  tone: string;
  hours: number;
}

function ticketAge(ticket: Ticket): AgeInfo {
  const closed = ["Closed", "Cancelled"].includes(ticket.status);
  const endRef = closed && ticket.closedAt ? new Date(ticket.closedAt) : new Date();
  const startedAt = new Date(ticket.createdAt);
  const hours = Math.max(0, (endRef.getTime() - startedAt.getTime()) / 3_600_000);
  const days = hours / 24;

  let label: string;
  if (hours < 1) label = `${Math.max(1, Math.round(hours * 60))}m`;
  else if (hours < 24) label = `${Math.round(hours)}h`;
  else if (days < 30) label = `${Math.round(days)}d`;
  else label = `${Math.round(days / 30)}mo`;

  let tone: string;
  if (closed) tone = "bg-gray-100 text-gray-600 border-gray-200";
  else if (hours < 24) tone = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (days < 3) tone = "bg-yellow-50 text-yellow-700 border-yellow-200";
  else if (days < 7) tone = "bg-orange-50 text-orange-700 border-orange-200";
  else tone = "bg-red-50 text-red-700 border-red-200";

  return { label, tone, hours };
}

export default function TicketsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasRole } = useRoles();
  const { employee } = useDashboardConfig();
  const myEmployeeId = employee?.id;
  const isSuperAdmin = hasRole("admin");
  const rawScope = searchParams.get("scope") ?? (isSuperAdmin ? "all" : "mine");
  const scope = !isSuperAdmin && rawScope === "all" ? "mine" : rawScope;

  useEffect(() => {
    if (!isSuperAdmin && (searchParams.get("scope") ?? "all") === "all") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("scope", "mine");
      router.replace(`/tickets?${params.toString()}`);
    }
  }, [isSuperAdmin, searchParams, router]);

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [form, setForm] = useState({
    title: "",
    description: "",
    departmentId: "",
    priority: "Medium" as "Low" | "Medium" | "High" | "Urgent",
    assignedToId: "",
  });

  type PendingFile = {
    url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  };
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.upload<PendingFile>("/api/v1/hrms/uploads", fd);
        setPendingFiles((prev) => [...prev, res.data]);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const { data: deptsData } = useQuery({
    queryKey: ["departments", "ticket-options"],
    queryFn: () =>
      api.get<DepartmentMini[]>("/api/v1/hrms/departments?limit=100"),
    staleTime: 5 * 60_000,
  });
  const departments = deptsData?.data ?? [];

  const { data: statsData } = useQuery({
    queryKey: ["ticket-stats", scope],
    queryFn: () => api.get<Stats>(`/api/v1/hrms/tickets/stats?scope=${scope}`),
  });
  const stats = statsData?.data;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (departmentFilter) params.set("departmentId", departmentFilter);
    if (search) params.set("search", search);
    if (scope === "mine" && myEmployeeId) params.set("raisedById", myEmployeeId);
    if (scope === "assigned" && myEmployeeId) params.set("assignedToId", myEmployeeId);
    return params.toString();
  }, [statusFilter, priorityFilter, departmentFilter, search, scope, page, myEmployeeId]);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ["tickets", queryString],
    queryFn: () => api.get<Ticket[]>(`/api/v1/hrms/tickets?${queryString}`),
    enabled: scope === "all" || !!myEmployeeId,
  });
  const tickets = ticketsData?.data ?? [];
  const totalCount = stats?.counts.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ id: string }>("/api/v1/hrms/tickets", body);
      const ticketId = res.data.id;
      for (const f of pendingFiles) {
        await api.post(`/api/v1/hrms/tickets/${ticketId}/attachments`, {
          fileUrl: f.url,
          fileName: f.fileName,
          fileType: f.fileType,
          fileSize: f.fileSize,
        });
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
      setShowCreate(false);
      setForm({
        title: "",
        description: "",
        departmentId: "",
        priority: "Medium",
        assignedToId: "",
      });
      setPendingFiles([]);
      setUploadError(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.departmentId) return;
    const body: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      departmentId: form.departmentId,
      priority: form.priority,
    };
    if (form.assignedToId) body.assignedToId = form.assignedToId;
    createMut.mutate(body);
  };

  const setScope = (s: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (s === "all") params.delete("scope");
    else params.set("scope", s);
    router.replace(`/tickets${params.toString() ? "?" + params.toString() : ""}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">
            Help Desk
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 btn btn-primary"
        >
          <Plus size={16} /> New Ticket
        </button>
      </div>

      {/* Scope tabs */}
      <div className="flex items-center gap-2 mb-4">
        {[
          ...(isSuperAdmin ? [{ key: "all", label: "All Tickets" }] : []),
          { key: "mine", label: "My Tickets" },
          { key: "assigned", label: "Assigned to Me" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium",
              scope === t.key
                ? "bg-[#16243A] text-white"
                : "bg-white border border-[var(--border)] text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard
            label="Total"
            value={stats.counts.total}
            icon={<LifeBuoy size={18} className="text-blue-600" />}
          />
          <StatCard
            label="Open"
            value={stats.counts.open + stats.counts.inProgress + stats.counts.onHold}
            icon={<Clock size={18} className="text-yellow-600" />}
          />
          <StatCard
            label="Urgent"
            value={stats.counts.urgent}
            icon={<AlertCircle size={18} className="text-red-600" />}
          />
          <StatCard
            label="SLA Breached"
            value={stats.counts.slaBreached}
            icon={<XCircle size={18} className="text-red-600" />}
          />
          <StatCard
            label="Resolved"
            value={stats.counts.resolved + stats.counts.closed}
            icon={<CheckCircle2 size={18} className="text-green-600" />}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <FilterBar>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); resetPage(); }}
            options={[
              { value: "", label: "All Status" },
              { value: "Open", label: "Open" },
              { value: "InProgress", label: "In Progress" },
              { value: "OnHold", label: "On Hold" },
              { value: "Resolved", label: "Resolved" },
              { value: "Closed", label: "Closed" },
              { value: "Reopened", label: "Reopened" },
            ]}
          />
          <Select
            value={priorityFilter}
            onChange={(v) => { setPriorityFilter(v); resetPage(); }}
            options={[
              { value: "", label: "All Priority" },
              { value: "Low", label: "Low" },
              { value: "Medium", label: "Medium" },
              { value: "High", label: "High" },
              { value: "Urgent", label: "Urgent" },
            ]}
          />
          <Select
            value={departmentFilter}
            onChange={(v) => { setDepartmentFilter(v); resetPage(); }}
            options={[
              { value: "", label: "All Departments" },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <FilterDivider />
          <FilterSearch
            value={search}
            onChange={(v) => { setSearch(v); resetPage(); }}
            placeholder="Search by ticket # or title..."
          />
        </FilterBar>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : tickets.length === 0 ? (
        <div className="p-1">
          <EmptyState
            variant="bot"
            title="No tickets found"
            className="border border-gray-200 shadow-sm"
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Ticket</th>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-left px-4 py-3 font-medium">Priority</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Raised By</th>
                <th className="text-left px-4 py-3 font-medium">Assigned</th>
                <th className="text-left px-4 py-3 font-medium">Age</th>
                <th className="text-left px-4 py-3 font-medium">SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.slice(0, PAGE_SIZE).map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="row-stagger border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  style={{ ["--i" as never]: Math.min(i, 10) }}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {t.ticketNo}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.title}</div>
                    {t._count && (t._count.comments > 0 || t._count.attachments > 0) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t._count.comments > 0 && `${t._count.comments} comments`}
                        {t._count.comments > 0 && t._count.attachments > 0 && " · "}
                        {t._count.attachments > 0 && `${t._count.attachments} files`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.department?.name ?? t.category?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        PRIORITY_COLORS[t.priority]
                      )}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        STATUS_COLORS[t.status],
                        t.status === "Open" && "badge-pulse-amber",
                        t.status === "InProgress" && "badge-pulse-amber",
                      )}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatName(t.raisedBy)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatName(t.assignedTo)}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const a = ticketAge(t);
                      return (
                        <span
                          title={`Open for ${Math.round(a.hours)}h`}
                          className={clsx(
                            "inline-flex items-center px-1.5 py-0.5 text-[11px] font-semibold rounded border",
                            a.tone,
                          )}
                        >
                          {a.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {t.resolveBreachedAt ? (
                      <span className="text-red-600 text-xs font-medium flex items-center gap-1">
                        <AlertCircle size={12} />
                        Breached{t.escalationLevel > 1 && ` · L${t.escalationLevel}`}
                      </span>
                    ) : isOverdue(t) ? (
                      <span className="text-orange-600 text-xs font-medium flex items-center gap-1">
                        <AlertCircle size={12} /> Overdue
                      </span>
                    ) : t.slaResolveDueAt ? (
                      <span className="text-xs text-gray-500">
                        {new Date(t.slaResolveDueAt).toLocaleDateString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Raise New Ticket"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              placeholder="Brief summary of the issue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              placeholder="Describe the issue in detail..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.departmentId}
                onChange={(v) =>
                  setForm({ ...form, departmentId: v, assignedToId: "" })
                }
                options={[
                  { value: "", label: "Select..." },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <Select
                value={form.priority}
                onChange={(v) =>
                  setForm({ ...form, priority: v as typeof form.priority })
                }
                options={[
                  { value: "Low", label: "Low" },
                  { value: "Medium", label: "Medium" },
                  { value: "High", label: "High" },
                  { value: "Urgent", label: "Urgent" },
                ]}
              />
            </div>
          </div>
          {(() => {
            const selectedDept = departments.find((d) => d.id === form.departmentId);
            const deptId = selectedDept?.id ?? undefined;
            const deptName = selectedDept?.name;
            return (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To (optional)
                  {deptName && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                      Department: {deptName}
                    </span>
                  )}
                </label>
                <EmployeeSelect
                  key={deptId ?? "all"}
                  value={form.assignedToId}
                  onChange={(id) => setForm({ ...form, assignedToId: id })}
                  placeholder={deptName ? `Pick from ${deptName}...` : "Leave empty for default assignee"}
                  endpoint="/api/v1/hrms/tickets/assignable"
                  departmentId={deptId}
                  excludeIds={myEmployeeId ? [myEmployeeId] : undefined}
                  disabled={!form.departmentId}
                />
                {!form.departmentId && (
                  <p className="text-[11px] text-gray-500 mt-1">Select a department first to load assignable employees.</p>
                )}
              </div>
            );
          })()}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attachments (optional)
            </label>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-3 text-xs text-gray-600 hover:border-[#3b82f6] hover:text-[#3b82f6] cursor-pointer transition-colors">
              <Paperclip size={14} />
              {uploading ? "Uploading..." : "Attach files (max 10MB each)"}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>

            {uploadError && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1">{uploadError}</span>
                <button type="button" onClick={() => setUploadError(null)} className="hover:text-red-900">
                  <X size={12} />
                </button>
              </div>
            )}

            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {pendingFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-xs"
                  >
                    <Paperclip size={12} className="text-gray-400" />
                    <span className="flex-1 truncate text-gray-700">{f.fileName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-gray-500 hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setPendingFiles([]);
                setUploadError(null);
              }}
              className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex items-center gap-3">
      <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-xl font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  );
}
