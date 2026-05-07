"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Filter,
  Info,
  X,
  ChevronUp,
  ChevronDown,
  Equal,
  Zap,
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
} from "lucide-react";
import {
  CompletedIcon,
  UpdatedIcon,
  CreatedIcon,
  DueSoonIcon,
  NoActivityIllustration,
  EpicProgressIllustration,
} from "@/components/illustrations/summary-icons";

interface Summary {
  totalIssues: number;
  progress: number;
  doneCount: number;
  byStatus: Array<{ statusId: string; name: string; color: string; category: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byAssignee: Array<{
    assigneeId: string | null;
    count: number;
    name: string | null;
    email: string | null;
    avatar: string | null;
  }>;
  recent: { completed: number; updated: number; created: number; dueSoon: number };
}

const PRIORITY_ORDER = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;

function PriorityIcon({ p }: { p: string }) {
  switch (p) {
    case "HIGHEST":
      return <ChevronUp className="h-3.5 w-3.5 text-red-600 stroke-[3]" />;
    case "HIGH":
      return <ChevronUp className="h-3.5 w-3.5 text-orange-500" />;
    case "MEDIUM":
      return <Equal className="h-3.5 w-3.5 text-amber-500" />;
    case "LOW":
      return <ChevronDown className="h-3.5 w-3.5 text-blue-500" />;
    case "LOWEST":
      return <ChevronDown className="h-3.5 w-3.5 text-blue-700 stroke-[3]" />;
    default:
      return null;
  }
}

const TYPE_META: Record<string, { label: string; Icon: typeof Zap; color: string }> = {
  EPIC: { label: "Epic", Icon: Zap, color: "text-purple-600" },
  TASK: { label: "Task", Icon: CheckSquare, color: "text-blue-600" },
  STORY: { label: "Story", Icon: BookOpen, color: "text-green-600" },
  BUG: { label: "Bug", Icon: Bug, color: "text-red-600" },
  SUBTASK: { label: "Subtask", Icon: ListTree, color: "text-gray-500" },
};

interface StatCardProps {
  label: string;
  value: number;
  sub: string;
  Icon: typeof CompletedIcon;
}

function StatCard({ label, value, sub, Icon }: StatCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 flex items-center gap-3 bg-white">
      <Icon className="h-11 w-11 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">
          <span className="text-base">{value}</span> {label}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

export function SummaryView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/summary`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setData(j.data);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const recent = data?.recent ?? { completed: 0, updated: 0, created: 0, dueSoon: 0 };
  const total = data?.totalIssues ?? 0;

  const priorityRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of data?.byPriority ?? []) map.set(p.priority, p.count);
    return PRIORITY_ORDER.map((p) => ({ priority: p, count: map.get(p) ?? 0 }));
  }, [data]);

  const maxPriority = Math.max(1, ...priorityRows.map((r) => r.count));

  const typeRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data?.byType ?? []) map.set(t.type, t.count);
    return Object.keys(TYPE_META).map((t) => ({ type: t, count: map.get(t) ?? 0 }));
  }, [data]);

  const maxType = Math.max(1, ...typeRows.map((r) => r.count));

  if (loading) {
    return (
      <div className="px-10 py-6 max-w-[1280px] mx-auto">
        <div className="h-16 rounded-lg bg-gray-100 animate-pulse mb-6" />
        <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-gray-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                <div className="h-2 w-24 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-5 h-[230px] animate-pulse bg-gray-50" />
          <div className="border border-gray-200 rounded-lg p-5 h-[230px] animate-pulse bg-gray-50" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-5 h-[230px] animate-pulse bg-gray-50" />
          <div className="border border-gray-200 rounded-lg p-5 h-[230px] animate-pulse bg-gray-50" />
        </div>
        <div className="border border-gray-200 rounded-lg p-5 h-[180px] animate-pulse bg-gray-50" />
      </div>
    );
  }

  return (
    <div className="px-10 py-6 max-w-[1280px] mx-auto">
      {!bannerDismissed && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-5 flex items-start gap-3 mb-6">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Customize your Reports view to suit your space.
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Head to the Reports tab to easily customize charts and widgets for a
              dashboard tailored to your space.
            </p>
            <div className="mt-2 flex items-center gap-4 text-xs">
              <Link
                href={`/spaces/${projectId}/reports`}
                className="text-blue-600 font-medium hover:underline"
              >
                Take me to Reports
              </Link>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-gray-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="p-1 rounded hover:bg-blue-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mb-4">
        <button className="inline-flex items-center gap-1.5 h-8 px-3 text-sm border border-gray-300 rounded hover:bg-gray-50">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard
          label="completed"
          value={recent.completed}
          sub="in the last 7 days"
          Icon={CompletedIcon}
        />
        <StatCard
          label="updated"
          value={recent.updated}
          sub="in the last 7 days"
          Icon={UpdatedIcon}
        />
        <StatCard
          label="created"
          value={recent.created}
          sub="in the last 7 days"
          Icon={CreatedIcon}
        />
        <StatCard
          label="due soon"
          value={recent.dueSoon}
          sub="in the next 7 days"
          Icon={DueSoonIcon}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="border border-gray-200 rounded-lg p-5 bg-white flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900">Status overview</h3>
          <p className="mt-1 text-xs text-gray-600">
            The status overview for this space will display here after you{" "}
            <Link
              href={`/spaces/${projectId}/board`}
              className="text-blue-600 hover:underline"
            >
              create some work items
            </Link>
            .
          </p>
          <div className="mt-4 flex-1 grid grid-cols-2 items-center gap-4">
            <div className="text-center">
              <div className="text-4xl font-semibold text-gray-900 leading-none">
                {total}
              </div>
              <div className="mt-2 text-xs text-gray-500">Total work items</div>
            </div>
            <div className="flex flex-col items-center text-center">
              <NoActivityIllustration className="h-20 w-auto" />
              <h4 className="mt-3 text-sm font-semibold text-gray-900">No activity yet</h4>
              <p className="mt-1 text-xs text-gray-600 max-w-[240px] leading-snug">
                Create a few work items and invite some teammates to your space to see
                your space activity.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 bg-white flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900">Priority breakdown</h3>
          <p className="mt-1 text-xs text-gray-600">
            Get a holistic view of how work is being prioritized.{" "}
            <a className="text-blue-600 hover:underline" href="#">
              How to manage priorities for projects
            </a>
          </p>
          <div className="mt-6 flex-1 flex flex-col">
            <div className="flex-1 flex items-end gap-4 px-2 min-h-[140px]">
              {priorityRows.map((r) => {
                const h = Math.round((r.count / maxPriority) * 100);
                return (
                  <div
                    key={r.priority}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className="w-full max-w-[42px] bg-blue-500 rounded-t-sm"
                      style={{
                        height: `${r.count > 0 ? Math.max(h, 10) : 0}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="border-t border-gray-200 mt-2" />
            <div className="mt-2 flex items-start gap-4 px-2 text-[11px] text-gray-600">
              {priorityRows.map((r) => (
                <div
                  key={r.priority}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="flex items-center gap-1">
                    <PriorityIcon p={r.priority} />
                    <span className="capitalize">{r.priority.toLowerCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="border border-gray-200 rounded-lg p-5 bg-white">
          <h3 className="text-sm font-semibold text-gray-900">Types of work</h3>
          <p className="mt-1 text-xs text-gray-600">
            Create some work items to view a breakdown of total work by work type.{" "}
            <a className="text-blue-600 hover:underline" href="#">
              What are work types?
            </a>
          </p>
          <div className="mt-5">
            <div className="grid grid-cols-[120px_1fr] text-[11px] text-gray-500 mb-2">
              <span>Type</span>
              <span>Distribution</span>
            </div>
            <div className="space-y-3">
              {typeRows.map((row) => {
                const meta = TYPE_META[row.type];
                if (!meta) return null;
                const w = (row.count / maxType) * 100;
                return (
                  <div key={row.type} className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                      {meta.label}
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${row.count > 0 ? Math.max(w, 3) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 bg-white">
          <h3 className="text-sm font-semibold text-gray-900">Team workload</h3>
          <p className="mt-1 text-xs text-gray-600">
            To monitor the capacity of your team,{" "}
            <Link
              href={`/spaces/${projectId}/board`}
              className="text-blue-600 hover:underline"
            >
              create some work items
            </Link>
            .
          </p>
          <div className="mt-5">
            <div className="grid grid-cols-[160px_1fr] text-[11px] text-gray-500 mb-2">
              <span>Assignee</span>
              <span>Work distribution</span>
            </div>
            <div className="space-y-3">
              {(data?.byAssignee ?? []).length === 0 ? (
                <div className="grid grid-cols-[160px_1fr] items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="h-5 w-5 rounded-full bg-gray-200 inline-flex items-center justify-center text-[10px] text-gray-500">
                      ?
                    </span>
                    Unassigned
                  </div>
                  <div className="h-2 rounded-full bg-gray-200" />
                </div>
              ) : (
                (data?.byAssignee ?? []).map((a) => {
                  const displayName = a.assigneeId
                    ? a.name ?? a.email ?? "Unknown"
                    : "Unassigned";
                  const initial = a.assigneeId
                    ? (a.name ?? a.email ?? "?").charAt(0).toUpperCase()
                    : "?";
                  return (
                    <div
                      key={a.assigneeId ?? "unassigned"}
                      className="grid grid-cols-[160px_1fr] items-center gap-3"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                        {a.avatar ? (
                          <img
                            src={a.avatar}
                            alt=""
                            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className={`h-5 w-5 flex-shrink-0 rounded-full text-[10px] inline-flex items-center justify-center ${
                              a.assigneeId ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"
                            }`}
                          >
                            {initial}
                          </span>
                        )}
                        <span className="truncate" title={a.email ?? displayName}>{displayName}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${(a.count / Math.max(1, total)) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-900">Epic progress</h3>
        <div className="mt-6 flex flex-col items-center text-center">
          <EpicProgressIllustration />
          <p className="mt-3 text-xs text-gray-600 max-w-[360px]">
            Use epics to track larger initiatives in your space.{" "}
            <a className="text-blue-600 hover:underline" href="#">
              What is an epic?
            </a>
          </p>
        </div>
      </div>

      <div className="text-center text-xs text-gray-500 pt-6 pb-2">
        Was the information shown in this page useful?{" "}
        <button className="ml-2 inline-flex items-center gap-1 text-gray-700 hover:underline">
          Give us feedback
        </button>
      </div>
    </div>
  );
}
