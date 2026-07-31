"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ChevronLeft, Plus, Calendar } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { FilterBar, FilterField, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { TaskRow, type TaskRowData } from "./_components/task-row";
import { NewTaskModal } from "./_components/new-task-modal";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";

const TASK_STATUS_LABELS: Record<TaskRowData["status"], string> = {
  Open: "Open",
  InProgress: "In Progress",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

export default function TasksHubPage() {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#22c55e] mb-4">
        <ChevronLeft size={14} /> Back
      </Link>

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-page-title text-gray-900">Todo</h1>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          <Plus size={13} /> New Todo
        </button>
      </div>

      <TasksList scope="mine" />

      <NewTaskModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

function TasksList({ scope }: { scope: "mine" }) {
  const api = useApiClient();
  const [datePreset, setDatePreset] = useState<"anytime" | "overdue" | "today" | "week" | "month">("anytime");
  // Honor a ?status= deep link (e.g. dashboard "Open tasks" → Incomplete tab);
  // default to All otherwise.
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const s = new URLSearchParams(window.location.search).get("status");
      if (s) return s;
    }
    return "Open,InProgress,Completed";
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const params = useMemo(() => {
    const p = new URLSearchParams({ scope });
    if (statusFilter) p.set("status", statusFilter);
    const now = new Date();
    if (datePreset === "today") {
      const eod = new Date(now); eod.setHours(23, 59, 59, 999);
      p.set("dueBefore", eod.toISOString());
    } else if (datePreset === "overdue") {
      p.set("dueBefore", now.toISOString());
      p.set("status", "Open,InProgress");
    } else if (datePreset === "week") {
      const wk = new Date(now); wk.setDate(wk.getDate() + 7);
      p.set("dueBefore", wk.toISOString());
    } else if (datePreset === "month") {
      const mo = new Date(now); mo.setMonth(mo.getMonth() + 1);
      p.set("dueBefore", mo.toISOString());
    }
    return p.toString();
  }, [scope, statusFilter, datePreset]);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", scope, params],
    queryFn: () => api.get<TaskRowData[]>(`/api/v1/hrms/tasks?${params}`),
    staleTime: 60_000,
  });
  const tasks = (data?.data ?? []).filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const pageItems = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Export the currently filtered task list, matching the visible columns.
  const excelColumns = [
    { header: "Title", key: "title", width: 30 },
    { header: "Description", key: "description", width: 30 },
    { header: "Assignee", key: "assignee", width: 22 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Due Date", key: "dueDate", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  const excelRows = tasks.map((t) => ({
    title: t.title,
    description: t.description ?? "",
    assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim() : "",
    priority: t.priority,
    dueDate: t.dueDate
      ? new Date(t.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "",
    status: TASK_STATUS_LABELS[t.status],
  }));

  return (
    <div className="space-y-3">
      <TabSwitcher
        value={statusFilter}
        onChange={(v) => { setStatusFilter(v); setPage(1); }}
        tabs={[
          { value: "Open,InProgress", label: "Incomplete" },
          { value: "Completed", label: "Completed" },
          { value: "Open,InProgress,Completed", label: "All" },
        ]}
      />
      <FilterBar>
        <FilterField icon={<Calendar size={13} className="text-gray-400" />}>
          <Select
            value={datePreset}
            onChange={(v) => { setDatePreset(v as typeof datePreset); setPage(1); }}
            options={[
              { value: "anytime", label: "Anytime" },
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Today" },
              { value: "week", label: "Next 7 days" },
              { value: "month", label: "Next 30 days" },
            ]}
          />
        </FilterField>
        <FilterSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search todos..." />
      </FilterBar>

      <div className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total: <strong className="text-gray-900">{tasks.length}</strong></span>
          <ExcelExportButton filename="tasks" sheetName="Todos" columns={excelColumns} rows={excelRows} label="Excel" />
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-500">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">No tasks match your filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-100">
                <th className="w-10" />
                <th className="text-left py-2.5 px-4">Todo</th>
                <th className="text-left py-2.5 px-4">Description</th>
                <th className="text-left py-2.5 px-4">Priority</th>
                <th className="text-left py-2.5 px-4">Due date</th>
                <th className="text-right py-2.5 px-4 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t, i) => (
                <TaskRow key={t.id} task={t} onClick={() => {}} index={i} />
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && tasks.length > 0 && (
          <Pagination page={page} totalPages={totalPages} total={tasks.length} limit={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}

