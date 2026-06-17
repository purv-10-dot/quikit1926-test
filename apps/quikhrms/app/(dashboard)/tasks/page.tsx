"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ChevronLeft, Plus, Calendar } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { FilterBar, FilterDivider, FilterField, FilterPills, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { TaskRow, type TaskRowData } from "./_components/task-row";
import { NewTaskModal } from "./_components/new-task-modal";

export default function TasksHubPage() {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="w-full px-6 py-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6] mb-4">
        <ChevronLeft size={14} /> Back
      </Link>

      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif-display text-4xl font-bold text-gray-900">Todo</h1>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          <Plus size={14} /> New Todo
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
  const [statusFilter, setStatusFilter] = useState<string>("Open,InProgress,Completed");
  const [search, setSearch] = useState("");

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

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterPills
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "Open,InProgress", label: "Incomplete" },
            { value: "Completed", label: "Completed" },
            { value: "Open,InProgress,Completed", label: "All" },
          ]}
        />
        <FilterDivider />
        <FilterField icon={<Calendar size={13} className="text-gray-400" />}>
          <Select
            value={datePreset}
            onChange={(v) => setDatePreset(v as typeof datePreset)}
            options={[
              { value: "anytime", label: "Anytime" },
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Today" },
              { value: "week", label: "Next 7 days" },
              { value: "month", label: "Next 30 days" },
            ]}
          />
        </FilterField>
        <FilterSearch value={search} onChange={setSearch} placeholder="Search todos..." />
      </FilterBar>

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total: <strong className="text-gray-900">{tasks.length}</strong></span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">No tasks match your filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-500 uppercase border-b border-gray-100">
                <th className="w-10" />
                <th className="text-left py-2 px-3">Todo</th>
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-left py-2 px-3">Priority</th>
                <th className="text-left py-2 px-3">Due date</th>
                <th className="text-right py-2 px-3 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <TaskRow key={t.id} task={t} onClick={() => {}} index={i} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

