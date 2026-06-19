"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Clock, ChevronRight, CheckSquare, Receipt, Palmtree } from "lucide-react";

interface Task { id: string; title: string; status: string }
interface LeaveRequest { id: string; status: string }
interface ExpenseClaim { id: string; status: string }

export function RecentlyAssigned() {
  const api = useApiClient();

  const { data: tasks } = useQuery({
    queryKey: ["home", "tasks", "mine"],
    queryFn: () => api.get<Task[]>("/api/v1/hrms/tasks?scope=mine&status=Open,InProgress").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });
  const { data: leaves } = useQuery({
    queryKey: ["home", "leaves", "pending"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests?status=Pending").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });
  const { data: expenses } = useQuery({
    queryKey: ["home", "expenses", "pending"],
    queryFn: () => api.get<ExpenseClaim[]>("/api/v1/hrms/expenses/claims?status=Submitted").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });

  const taskCount = Array.isArray(tasks?.data) ? tasks.data.length : 0;
  const leaveCount = Array.isArray(leaves?.data) ? leaves.data.length : 0;
  const expenseCount = Array.isArray(expenses?.data) ? expenses.data.length : 0;
  const total = taskCount + leaveCount + expenseCount;

  const items = [
    { label: "Open tasks", count: taskCount, href: "/tasks", icon: <CheckSquare size={14} />, color: "text-blue-500" },
    { label: "Leave approvals", count: leaveCount, href: "/leaves", icon: <Palmtree size={14} />, color: "text-emerald-500" },
    { label: "Expense approvals", count: expenseCount, href: "/expenses", icon: <Receipt size={14} />, color: "text-amber-500" },
  ].filter((i) => i.count > 0);

  return (
    <div className="surface-card px-6 py-5">
      <h3 className="text-base font-bold text-gray-900 mb-2">Recently assigned</h3>
      {total === 0 ? (
        <div className="flex items-center gap-3 py-3 text-sm text-gray-500">
          <Clock size={16} className="text-gray-400" />
          You&apos;re all caught up. Nothing assigned right now.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50 -mx-6 px-6 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                  {it.icon}
                </div>
                <span className="text-sm text-gray-900">{it.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-[#0A1628] text-white text-xs font-bold">
                  {it.count}
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
