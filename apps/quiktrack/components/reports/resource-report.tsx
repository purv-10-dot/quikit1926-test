"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Target,
  AlertTriangle,
  CalendarRange,
} from "lucide-react";
import { UserTimeDrawer } from "@/components/timesheet/user-time-drawer";
import {
  KpiCard,
  ResourceTableRow,
  SortableHeader,
  computeRange,
  formatHhMm,
  type Granularity,
  type SortDir,
  type SortKey,
} from "./resource-report-bits";
import { ResourceToolbar } from "./resource-toolbar";

const PAGE_SIZE = 15;

interface Row {
  userId: string;
  name: string;
  email: string;
  timesheetFilled: boolean;
  expectedHours: number;
  spentHours: number;
  estimatedHours: number;
  overshotHours: number;
  utilizationPct: number;
  overshotPct: number;
}

interface ReportPage {
  summary: {
    employees: number;
    employeesFilled: number;
    totalSpent: number;
    totalEstimated: number;
    totalOvershot: number;
    totalExpected: number;
  };
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function ResourceReport() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [roleUserId, setRoleUserId] = useState("");
  const [drawerUser, setDrawerUser] = useState<{ id: string; label: string } | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const onSortChange = (key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const range = useMemo(() => computeRange(granularity, anchorDate), [granularity, anchorDate]);

  const drawerRange = useMemo(() => {
    const fromD = new Date(`${range.from}T00:00:00`);
    const toD = new Date(`${range.to}T00:00:00`);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    let label: string;
    if (granularity === "day") {
      label = fromD.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } else if (granularity === "month") {
      label = fromD.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } else {
      label = `${fmt(fromD)} – ${fmt(toD)}, ${toD.getFullYear()}`;
    }
    return { from: fromD, to: toD, label };
  }, [range.from, range.to, granularity]);

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users-flat"],
    queryFn: async (): Promise<OrgUser[]> => {
      const r = await fetch("/api/org/users");
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load users");
      return j.data;
    },
  });

  // Users holding a Project Admin / PM role — options for the role filter.
  const roleUsersQ = useQuery({
    queryKey: ["quiktrack", "reports-role-users"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const r = await fetch("/api/reports/role-users");
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const reportQ = useInfiniteQuery({
    queryKey: ["quiktrack", "resource-report", range.from, range.to, selectedUserIds.join(","), roleUserId, sortBy, sortDir],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<ReportPage> => {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (selectedUserIds.length > 0) params.set("userIds", selectedUserIds.join(","));
      if (roleUserId) params.set("roleUserId", roleUserId);
      const r = await fetch(`/api/reports/resource?${params.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load");
      return j.data;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const summary = reportQ.data?.pages[0]?.summary;
  const rows = useMemo(
    () => reportQ.data?.pages.flatMap((p) => p.rows) ?? [],
    [reportQ.data],
  );

  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && reportQ.hasNextPage && !reportQ.isFetchingNextPage) {
          reportQ.fetchNextPage();
        }
      },
      { root, rootMargin: "200px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [reportQ.hasNextPage, reportQ.isFetchingNextPage, reportQ.fetchNextPage, rows.length]);

  const fillPct = summary && summary.employees > 0 ? (summary.employeesFilled / summary.employees) * 100 : 0;
  const utilPct = summary && summary.totalExpected > 0 ? (summary.totalSpent / summary.totalExpected) * 100 : 0;
  const overshotSummaryPct = summary && summary.totalEstimated > 0 ? (summary.totalOvershot / summary.totalEstimated) * 100 : 0;

  return (
    <div className="p-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Resource Reports</h1>
        <p className="text-sm text-gray-500">
          Per-employee utilisation across the selected period — filled timesheets, spent vs. estimated, and overshoot.
        </p>
      </header>

      <ResourceToolbar
        granularity={granularity}
        onGranularityChange={setGranularity}
        anchorDate={anchorDate}
        onAnchorChange={setAnchorDate}
        rangeLabel={drawerRange.label}
        users={usersQ.data ?? []}
        selectedUserIds={selectedUserIds}
        onSelectedUserIdsChange={setSelectedUserIds}
        roleUserId={roleUserId}
        onRoleUserIdChange={setRoleUserId}
        roleUserOptions={(roleUsersQ.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          icon={<Briefcase className="h-4 w-4" />}
          tone="blue"
          label="Employees"
          value={String(summary?.employees ?? 0)}
          hint={selectedUserIds.length > 0 ? "Filtered" : "In active period"}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          label="Filled timesheet"
          value={String(summary?.employeesFilled ?? 0)}
          hint={`${Math.round(fillPct)}% of employees`}
          progressPct={fillPct}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          tone="blue"
          label="Hours spent"
          value={formatHhMm(summary?.totalSpent ?? 0)}
          hint={`${Math.round(utilPct)}% utilisation`}
          progressPct={Math.min(100, utilPct)}
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          tone="amber"
          label="Estimated hours"
          value={formatHhMm(summary?.totalEstimated ?? 0)}
          hint="Across assigned issues"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
          label="Overshot hours"
          value={formatHhMm(summary?.totalOvershot ?? 0)}
          hint={`${Math.round(overshotSummaryPct)}% over estimate`}
          progressPct={Math.min(100, overshotSummaryPct)}
        />
        <KpiCard
          icon={<CalendarRange className="h-4 w-4" />}
          tone="gray"
          label="Expected hours"
          value={formatHhMm(summary?.totalExpected ?? 0)}
          hint="8h × working days"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div ref={scrollContainerRef} className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                <SortableHeader label="Employee" sortKey="name" current={sortBy} dir={sortDir} onChange={onSortChange} />
                <SortableHeader label="Status" sortKey="status" current={sortBy} dir={sortDir} onChange={onSortChange} />
                <SortableHeader label="Expected" sortKey="expected" current={sortBy} dir={sortDir} onChange={onSortChange} align="right" />
                <SortableHeader label="Spent" sortKey="spent" current={sortBy} dir={sortDir} onChange={onSortChange} align="right" />
                <SortableHeader label="Estimated" sortKey="estimated" current={sortBy} dir={sortDir} onChange={onSortChange} align="right" />
                <SortableHeader label="Overshot" sortKey="overshot" current={sortBy} dir={sortDir} onChange={onSortChange} align="right" />
                <SortableHeader label="Utilisation" sortKey="utilization" current={sortBy} dir={sortDir} onChange={onSortChange} className="w-44" />
                <SortableHeader label="Overshot %" sortKey="overshotPct" current={sortBy} dir={sortDir} onChange={onSortChange} align="right" />
              </tr>
            </thead>
            <tbody>
              {reportQ.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td colSpan={9} className="px-4 py-3">
                      <span className="qt-shimmer block h-6 rounded" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="text-sm text-gray-700 font-medium">No employees match the current filters</div>
                    <div className="text-xs text-gray-400 mt-1">Try widening the date range or clearing the people filter.</div>
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((r, idx) => (
                    <ResourceTableRow
                      key={r.userId}
                      row={r}
                      index={idx}
                      onOpen={(id, label) => setDrawerUser({ id, label })}
                    />
                  ))}
                  {reportQ.hasNextPage && (
                    <tr ref={sentinelRef}>
                      <td colSpan={9} className="px-4 py-3 text-center text-xs text-gray-400">
                        {reportQ.isFetchingNextPage ? "Loading more…" : "Scroll for more"}
                      </td>
                    </tr>
                  )}
                  {!reportQ.hasNextPage && summary && summary.employees > PAGE_SIZE && (
                    <tr>
                      <td colSpan={9} className="px-4 py-3 text-center text-xs text-gray-400">
                        Showing {rows.length} of {summary.employees}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerUser && (
        <UserTimeDrawer
          userId={drawerUser.id}
          userLabel={drawerUser.label}
          from={drawerRange.from}
          to={drawerRange.to}
          rangeLabel={drawerRange.label}
          onClose={() => setDrawerUser(null)}
        />
      )}
    </div>
  );
}
