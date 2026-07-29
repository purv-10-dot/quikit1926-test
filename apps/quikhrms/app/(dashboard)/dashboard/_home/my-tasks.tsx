"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import Link from "next/link";
import { clsx } from "clsx";
import { Check } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  dueDate: string | null;
  requesterId?: string | null;
  taskList?: { name: string; color: string | null } | null;
}
interface Me { id: string }

function dueLabel(due: string | null): string {
  if (!due) return "";
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `Overdue ${-diff}d`;
  return `Due in ${diff}d`;
}

const TABS = [
  { key: "todo", label: "To do" },
  { key: "delegated", label: "Delegated to me" },
  { key: "completed", label: "Completed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function MyTasksWidget() {
  const api = useApiClient();
  const [tab, setTab] = useState<TabKey>("todo");

  const { data: meRes } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const meId = meRes?.data?.id;

  const { data } = useQuery({
    queryKey: ["my-tasks", "list"],
    queryFn: () => api.get<Task[]>("/api/v1/hrms/tasks?scope=mine&limit=50"),
    staleTime: 60_000,
  });
  const all = data?.data ?? [];

  const filtered = all.filter((t) => {
    if (tab === "completed") return t.status === "Completed";
    const active = t.status === "Open" || t.status === "InProgress";
    if (!active) return false;
    if (tab === "delegated") return !!t.requesterId && t.requesterId !== meId;
    return true;
  }).slice(0, 5);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-900">My tasks</h3>
        <Link href="/tasks" className="text-[11px] font-semibold text-green-700 hover:underline">View all tasks</Link>
      </div>
      <div className="flex items-center gap-4 border-b border-gray-100 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx("pb-2 text-xs font-medium border-b-2 -mb-px transition",
              tab === t.key ? "border-green-500 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No tasks here.</p>
      ) : (
        <div className="space-y-1">
          {filtered.map((t) => (
            <Link key={t.id} href="/tasks" className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 transition">
              <span className={clsx("mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center",
                t.status === "Completed" ? "bg-green-500 border-green-500" : "border-gray-300")}>
                {t.status === "Completed" && <Check size={11} className="text-white" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <p className={clsx("text-[13px] truncate", t.status === "Completed" ? "text-gray-400 line-through" : "text-gray-800")}>{t.title}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {t.taskList?.name ?? "Task"}{t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
