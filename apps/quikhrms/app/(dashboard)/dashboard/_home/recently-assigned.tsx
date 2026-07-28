"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { withBasePath } from "@/lib/utils/base-path";
import { clsx } from "clsx";
import { Clock, ChevronRight, CheckSquare, Receipt, Palmtree, Briefcase } from "lucide-react";

interface Person { id: string; firstName: string; lastName: string; profilePhoto: string | null }
interface Task { id: string; title: string; status: string }
interface LeaveRequest { id: string; status: string; endDate: string; employee: Person | null }
interface ExpenseClaim { id: string; status: string; requester: Person | null }
interface ReqApprovalRaiser { id: string; firstName: string; lastName: string }
interface ReqApprovalsQueue { mine: { requisition: { raiser: ReqApprovalRaiser | null } }[] }

/**
 * A still-Pending leave whose dates have already passed can't be actioned in
 * time — treat it as expired so it drops out of the approval count.
 */
function isExpiredPending(status: string, endDate: string): boolean {
  if (status !== "Pending") return false;
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end.getTime() < today.getTime();
}

function initials(p: Person) {
  return `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Collapse a list of requesters to distinct people, preserving first-seen order. */
function distinctPeople(people: (Person | null)[]): Person[] {
  const seen = new Map<string, Person>();
  for (const p of people) {
    if (p && !seen.has(p.id)) seen.set(p.id, p);
  }
  return [...seen.values()];
}

/** Overlapping avatar circles (photo or initials) + an "N person/people" label. */
function AvatarStack({ people }: { people: Person[] }) {
  const shown = people.slice(0, 3);
  const overflow = people.length - shown.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((p) =>
          p.profilePhoto ? (
            <img
              key={p.id}
              src={withBasePath(p.profilePhoto)}
              alt={`${p.firstName} ${p.lastName}`}
              title={`${p.firstName} ${p.lastName}`}
              className="w-6 h-6 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div
              key={p.id}
              title={`${p.firstName} ${p.lastName}`}
              className="w-6 h-6 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white"
            >
              {initials(p)}
            </div>
          ),
        )}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[10px] font-semibold ring-2 ring-white">
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {people.length} {people.length === 1 ? "person" : "people"}
      </span>
    </div>
  );
}

export function RecentlyAssigned() {
  const api = useApiClient();

  const { data: tasks } = useQuery({
    queryKey: ["home", "tasks", "mine"],
    queryFn: () => api.get<Task[]>("/api/v1/hrms/tasks?scope=mine&status=Open,InProgress").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });
  // "Approvals" = items assigned to the *current user* to action, not every
  // pending item in the org. Both endpoints scope to the caller as approver.
  const { data: leaves } = useQuery({
    queryKey: ["home", "leaves", "pending-approvals"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests/pending-approvals").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });
  const { data: expenses } = useQuery({
    queryKey: ["home", "expenses", "pending-approvals"],
    queryFn: () => api.get<ExpenseClaim[]>("/api/v1/hrms/expenses/claims/pending-approvals").catch(() => ({ data: [] })),
    staleTime: 60_000,
  });
  const { data: reqApprovals } = useQuery({
    queryKey: ["home", "requisition-approvals"],
    queryFn: () => api.get<ReqApprovalsQueue>("/api/v1/hrms/recruit/requisitions/approvals-queue").catch(() => ({ data: { mine: [] } as ReqApprovalsQueue })),
    staleTime: 60_000,
  });

  const taskCount = Array.isArray(tasks?.data) ? tasks.data.length : 0;
  // Requesters behind the items awaiting my approval — deduped so the stack
  // shows people, not one avatar per request.
  const leavePeople = distinctPeople(
    (Array.isArray(leaves?.data) ? leaves.data : [])
      .filter((l) => !isExpiredPending(l.status, l.endDate))
      .map((l) => l.employee),
  );
  const expensePeople = distinctPeople(
    (Array.isArray(expenses?.data) ? expenses.data : []).map((e) => e.requester),
  );
  const reqPeople = distinctPeople(
    (Array.isArray(reqApprovals?.data?.mine) ? reqApprovals.data.mine : [])
      .map((m) => (m.requisition.raiser ? { ...m.requisition.raiser, profilePhoto: null } : null)),
  );

  const total = taskCount + leavePeople.length + expensePeople.length + reqPeople.length;

  // `people` rows render an avatar stack; count-only rows (tasks are yours, no
  // requester) keep the number badge.
  const items = [
    { label: "Open tasks", count: taskCount, people: null as Person[] | null, href: "/tasks?status=Open,InProgress", icon: <CheckSquare size={14} /> },
    { label: "Leave approvals", count: leavePeople.length, people: leavePeople, href: "/leaves/team-leaves", icon: <Palmtree size={14} /> },
    { label: "Expense approvals", count: expensePeople.length, people: expensePeople, href: "/expenses", icon: <Receipt size={14} /> },
    { label: "Requisition approvals", count: reqPeople.length, people: reqPeople, href: "/recruit/approvals", icon: <Briefcase size={14} /> },
  ].filter((i) => i.count > 0);

  return (
    <div className="surface-card px-6 py-5">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Action Required</h3>
      {total === 0 ? (
        <div className="flex items-center gap-3 py-3 text-xs text-gray-500">
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
                <span className="text-[13px] font-semibold text-gray-900">{it.label}</span>
              </div>
              <div className="flex items-center gap-3">
                {it.people ? (
                  <AvatarStack people={it.people} />
                ) : (
                  <span className={clsx("inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-[#0A1628] text-white text-[11px] font-medium")}>
                    {it.count}
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
