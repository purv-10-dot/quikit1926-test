"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  ReportsBannerIllustration,
} from "@/components/illustrations/summary-icons";
import { StatusDonut } from "./status-donut";
import { ChartTip } from "./chart-tip";
import {
  SummaryFilter,
  type SummaryFilters,
  type FilterOptions,
} from "./summary-filter";

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
  epicProgress: Array<{
    id: string;
    key: string;
    title: string;
    done: number;
    inProgress: number;
    todo: number;
    total: number;
  }>;
  recent: { completed: number; updated: number; created: number; dueSoon: number };
  filterOptions?: FilterOptions;
}

const EMPTY_OPTIONS: FilterOptions = {
  parents: [],
  assignees: [],
  statuses: [],
  types: [],
};

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
  const [filters, setFilters] = useState<SummaryFilters>({
    parents: [],
    assignees: [],
    statuses: [],
    types: [],
  });
  const loadedOnce = useRef(false);

  useEffect(() => {
    let alive = true;
    // Only show the full-page skeleton before the first load. On subsequent
    // filter changes we keep the current view (and the filter bar) mounted so
    // the dropdowns don't disappear mid-interaction.
    if (!loadedOnce.current) setLoading(true);
    const params = new URLSearchParams();
    if (filters.parents.length) params.set("parents", filters.parents.join(","));
    if (filters.assignees.length) params.set("assignees", filters.assignees.join(","));
    if (filters.statuses.length) params.set("statuses", filters.statuses.join(","));
    if (filters.types.length) params.set("types", filters.types.join(","));
    const qs = params.toString();
    fetch(`/api/projects/${projectId}/summary${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setData(j.data);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          loadedOnce.current = true;
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, filters]);

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
              Customize your Reports view to suit your project.
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Head to the Reports tab to easily customize charts and widgets for a
              dashboard tailored to your project.
            </p>
            <div className="mt-2 flex items-center gap-4 text-xs">
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-gray-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
          <ReportsBannerIllustration className="hidden sm:block h-[72px] w-auto shrink-0 self-center" />
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
        <SummaryFilter
          options={data?.filterOptions ?? EMPTY_OPTIONS}
          value={filters}
          onChange={setFilters}
        />
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
            {total > 0 ? (
              "A breakdown of work items by status across this project."
            ) : (
              <>
                The status overview for this project will display here after you{" "}
                <Link
                  href={`/spaces/${projectId}/board`}
                  className="text-blue-600 hover:underline"
                >
                  create some work items
                </Link>
                .
              </>
            )}
          </p>
          {total > 0 ? (
            <div className="mt-4 flex-1 flex items-center">
              <StatusDonut segments={data?.byStatus ?? []} total={total} />
            </div>
          ) : (
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
                  Create a few work items and invite some teammates to your project to see
                  your project activity.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-5 bg-white flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900">Priority breakdown</h3>
          <p className="mt-1 text-xs text-gray-600">
            Get a holistic view of how work is being prioritized.
          </p>
          <div className="mt-6 flex-1 flex flex-col">
            <div className="flex-1 flex items-end gap-4 px-2 min-h-[140px]">
              {priorityRows.map((r) => {
                const h = Math.round((r.count / maxPriority) * 100);
                const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                const label = r.priority.charAt(0) + r.priority.slice(1).toLowerCase();
                return (
                  <div
                    key={r.priority}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className="group relative w-full max-w-[42px] bg-blue-500 rounded-t-sm hover:bg-blue-600 cursor-pointer"
                      style={{ height: `${r.count > 0 ? Math.max(h, 10) : 0}%` }}
                    >
                      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
                        <span className="font-medium text-gray-900">{label}</span>
                        <span className="tabular-nums text-gray-500">{r.count} · {pct}%</span>
                      </span>
                    </div>
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
                const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                return (
                  <div key={row.type} className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                      {meta.label}
                    </div>
                    <ChartTip label={meta.label} value={`${row.count} · ${pct}%`}>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden cursor-pointer">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${row.count > 0 ? Math.max(w, 3) : 0}%` }}
                        />
                      </div>
                    </ChartTip>
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
                      <ChartTip
                        label={displayName}
                        value={`${a.count} · ${Math.round((a.count / Math.max(1, total)) * 100)}%`}
                      >
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden cursor-pointer">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${(a.count / Math.max(1, total)) * 100}%` }}
                          />
                        </div>
                      </ChartTip>
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
        {/* Only epics that actually have work items — an epic with no items has
            nothing to progress, so it's hidden rather than shown as an empty
            "No items" bar. If none have items, the empty-state below shows. */}
        {(() => {
          const epicsWithItems = (data?.epicProgress ?? []).filter((e) => e.total > 0);
          return epicsWithItems.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-gray-600">
              See how your epics are progressing at a glance.
            </p>
            <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> In progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" /> To do
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {epicsWithItems.map((e) => {
                const t = Math.max(1, e.total);
                const donePct = (e.done / t) * 100;
                const inProgPct = (e.inProgress / t) * 100;
                const todoPct = (e.todo / t) * 100;
                const completePct = Math.round((e.done / t) * 100);
                return (
                  <div key={e.id}>
                    <div className="flex items-center gap-2 text-sm text-gray-800 mb-1.5">
                      <Zap className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                      <span className="font-medium">{e.key}</span>
                      <span className="text-gray-600 truncate" title={e.title}>
                        {e.title}
                      </span>
                      <span className="ml-auto text-xs text-gray-500 tabular-nums shrink-0">
                        {`${completePct}%`}
                      </span>
                    </div>
                    {(
                      <ChartTip
                        content={
                          <>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-green-500" />
                              <span className="font-medium text-gray-900">Done</span>
                              <span className="ml-auto tabular-nums text-gray-500">{e.done} · {Math.round(donePct)}%</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-blue-500" />
                              <span className="font-medium text-gray-900">In progress</span>
                              <span className="ml-auto tabular-nums text-gray-500">{e.inProgress} · {Math.round(inProgPct)}%</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-gray-300" />
                              <span className="font-medium text-gray-900">To do</span>
                              <span className="ml-auto tabular-nums text-gray-500">{e.todo} · {Math.round(todoPct)}%</span>
                            </span>
                          </>
                        }
                      >
                        <div className="h-5 w-full rounded bg-gray-100 overflow-hidden flex cursor-pointer">
                          <div
                            className="h-full bg-green-500 flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ width: `${donePct}%` }}
                          >
                            {donePct >= 12 ? `${Math.round(donePct)}%` : ""}
                          </div>
                          <div
                            className="h-full bg-blue-500 flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ width: `${inProgPct}%` }}
                          >
                            {inProgPct >= 12 ? `${Math.round(inProgPct)}%` : ""}
                          </div>
                          <div
                            className="h-full bg-gray-300"
                            style={{ width: `${todoPct}%` }}
                          />
                        </div>
                      </ChartTip>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-6 flex flex-col items-center text-center">
            <EpicProgressIllustration />
            <p className="mt-3 text-xs text-gray-600 max-w-[360px]">
              Use epics to track larger initiatives in your project. Create an
              epic from the Epics tab, then group related work items under it.
            </p>
          </div>
          );
        })()}
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
