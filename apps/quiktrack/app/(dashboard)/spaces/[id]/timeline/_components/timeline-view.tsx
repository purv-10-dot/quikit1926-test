"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import { useTimelineViewSettings } from "@/lib/hooks/useTimelineViewSettings";
import type { Col, Member, TimelineIssue, ZoomLevel } from "./timeline-meta";
import {
  WORK_COL_WIDTH,
  buildColumns,
  totalGridWidth,
} from "./timeline-meta";
import {
  STATUS_COL_WIDTH,
  ASSIGNEE_COL_WIDTH,
  START_COL_WIDTH,
  END_COL_WIDTH,
  type TimelineStatus,
} from "./timeline-view-settings";
import { TimelineSettingsPopover } from "./timeline-settings-popover";
import { TimelineConnections, type DepEdge } from "./timeline-connections";
import { TimelineRow } from "./timeline-row";
import { TimelineCreateEpic } from "./timeline-create-epic";
import { FilterSelect } from "../../grouped-kanban/_components/toolbar/filter-select";
import { FilterMultiSelect } from "../../grouped-kanban/_components/toolbar/filter-multi-select";

const ROOT_PAGE_SIZE = 20;

/**
 * Timeline view. Shows all epics for the project (paginated by scroll); each
 * epic expands to show its tasks (paginated by scroll); each task expands to
 * show its subtasks (paginated by scroll). All children are fetched lazily
 * via /api/issues with the appropriate filters — nothing below the visible
 * row is loaded upfront.
 */
export function TimelineView({ projectId }: { projectId: string }) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [search, setSearch] = useState("");
  // Debounced copy fed into the API — avoids hammering /api/issues on every keystroke.
  const [appliedSearch, setAppliedSearch] = useState("");
  // Multiselect assignee filter (narrows tasks under each epic) + single epic filter.
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([]);
  const [filterEpicId, setFilterEpicId] = useState("");
  const assigneeFilter = filterAssigneeIds.join(",");
  const queryClient = useQueryClient();
  // Shared project members via React Query (same key as the other space views).
  const { data: members = [] } = useApiData<Member[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: Member[] } | Member[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );
  // Epics for the Epic filter dropdown options.
  const { data: epicOptionsData = [] } = useApiData<{ id: string; key: string; title: string }[]>(
    ["quiktrack", "project-epics", projectId],
    `/api/issues?projectId=${projectId}&type=EPIC&limit=200`,
    {
      select: (d) =>
        (Array.isArray(d) ? d : []).map((e: { id: string; key: string; title: string }) => ({
          id: e.id,
          key: e.key,
          title: e.title,
        })),
    },
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Server-persisted "View settings" (hide done, columns, bar color, warnings).
  const { settings, updateSettings } = useTimelineViewSettings(projectId);

  // Project statuses — for the Status column, hide-done filter, and status-based
  // bar color.
  const { data: statuses = [] } = useApiData<TimelineStatus[]>(
    ["quiktrack", "project-statuses", projectId],
    `/api/projects/${projectId}/statuses`,
  );
  const statusesById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s] as const)),
    [statuses],
  );
  const membersById = useMemo(
    () => new Map(members.filter((m) => m.user).map((m) => [m.user!.id, m] as const)),
    [members],
  );

  // Dependency links (RELATES_TO) across the project — drawn as connection
  // arrows between bars whose endpoints are both currently rendered.
  const { data: depEdges = [] } = useApiData<DepEdge[]>(
    ["quiktrack", "project-links", projectId],
    `/api/projects/${projectId}/links`,
    {
      select: (d) => {
        const arr = Array.isArray(d)
          ? (d as Array<{ sourceIssueId: string; targetIssueId: string }>)
          : [];
        return arr.map((l) => ({
          sourceIssueId: l.sourceIssueId,
          targetIssueId: l.targetIssueId,
        }));
      },
    },
  );

  // Width of the frozen left area = Work column + optional Status/Assignee/date cells.
  const leftWidth =
    WORK_COL_WIDTH +
    (settings.showStatus ? STATUS_COL_WIDTH : 0) +
    (settings.showAssignee ? ASSIGNEE_COL_WIDTH : 0) +
    (settings.showStart ? START_COL_WIDTH : 0) +
    (settings.showEnd ? END_COL_WIDTH : 0);

  // Root-level epics with cursor pagination.
  const [epics, setEpics] = useState<TimelineIssue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Axis domain = the loaded epics' date range (not "today"), so bars sit where
  // the work actually is. Falls back to a window around now when nothing has dates.
  const domain = useMemo(() => {
    const ts: number[] = [];
    for (const e of epics) {
      if (e.startDate) {
        const t = new Date(e.startDate).getTime();
        if (!Number.isNaN(t)) ts.push(t);
      }
      if (e.dueDate) {
        const t = new Date(e.dueDate).getTime();
        if (!Number.isNaN(t)) ts.push(t);
      }
    }
    if (ts.length === 0) {
      const now = Date.now();
      return { start: new Date(now - 14 * 86_400_000), end: new Date(now + 30 * 86_400_000) };
    }
    return { start: new Date(Math.min(...ts)), end: new Date(Math.max(...ts)) };
  }, [epics]);

  const columns = useMemo<Col[]>(() => buildColumns(zoom, domain.start, domain.end), [zoom, domain]);
  const stripWidth = totalGridWidth(columns);

  // Boot: fetch session (members come from React Query above).
  useEffect(() => {
    let alive = true;
    fetch("/api/session")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.user?.id) setCurrentUserId(j.user.id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Refetch members when membership changes via the Add-people modal.
  useMembersChanged(projectId, () => {
    void queryClient.invalidateQueries({
      queryKey: ["quiktrack", "project-members", projectId],
    });
  });

  // Root-level fetch: epics only.
  const loadEpics = useCallback(
    async (initial = false) => {
      if (loading) return;
      if (!initial && !hasMore) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          projectId,
          type: "EPIC",
          limit: String(ROOT_PAGE_SIZE),
        });
        if (appliedSearch.trim()) params.set("search", appliedSearch.trim());
        if (!initial && cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
        if (res?.success) {
          setEpics((prev) => (initial ? res.data : [...prev, ...res.data]));
          setCursor(res.nextCursor ?? null);
          setHasMore(!!res.nextCursor);
          setLoaded(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, appliedSearch, cursor, hasMore, loading],
  );

  // Debounce the raw search input → applied value the API actually uses.
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset + reload when project / appliedSearch / refreshKey changes.
  useEffect(() => {
    setEpics([]);
    setCursor(null);
    setHasMore(false);
    setLoaded(false);
    void loadEpics(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, appliedSearch, refreshKey]);

  // IntersectionObserver for root-level pagination.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loading) void loadEpics(false);
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadEpics]);

  // Listen for issue create / update events so the timeline stays fresh.
  useEffect(() => {
    function refresh() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener("quiktrack:issue-created", refresh);
    window.addEventListener("quiktrack:issue-updated", refresh);
    return () => {
      window.removeEventListener("quiktrack:issue-created", refresh);
      window.removeEventListener("quiktrack:issue-updated", refresh);
    };
  }, []);

  return (
    <div className="relative flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search timeline"
              className="h-8 w-[220px] pl-8 pr-3 text-xs border border-gray-300 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <FilterMultiSelect
            values={filterAssigneeIds}
            onChange={setFilterAssigneeIds}
            options={[
              { value: "null", label: "Unassigned", muted: true },
              ...members
                .filter((m) => m.user)
                .map((m) => {
                  const u = m.user!;
                  const label =
                    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
                  return { value: u.id, label };
                }),
            ]}
            placeholder="Any assignee"
            summaryNoun="people"
            searchable
            width={220}
          />
          <FilterSelect
            value={filterEpicId}
            onChange={setFilterEpicId}
            options={[
              { value: "", label: "Any epic", muted: true },
              ...epicOptionsData.map((e) => ({ value: e.id, label: `${e.key} · ${e.title}` })),
            ]}
            placeholder="Any epic"
            width={240}
          />
        </div>

        <TimelineSettingsPopover
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onChange={updateSettings}
        />
      </div>

      {/* Grid — explicit width on the inner div + overflow-x:scroll guarantees
          a horizontal scrollbar even when the parent layout doesn't propagate
          its width. */}
      <div className="scrollbar-visible flex-1 overflow-x-scroll overflow-y-auto">
        <div
          ref={contentRef}
          className="relative"
          style={{ width: leftWidth + stripWidth }}
        >
          {/* Header row */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-20">
            <div
              style={{ width: leftWidth }}
              className="shrink-0 flex sticky left-0 bg-white z-10 border-r border-gray-200"
            >
              <div
                style={{ width: WORK_COL_WIDTH }}
                className="shrink-0 px-4 py-3 text-xs font-medium text-gray-700"
              >
                Work
              </div>
              {settings.showStatus && (
                <div style={{ width: STATUS_COL_WIDTH }} className="shrink-0 px-3 py-3 text-xs font-medium text-gray-700 border-l border-gray-100">
                  Status
                </div>
              )}
              {settings.showAssignee && (
                <div style={{ width: ASSIGNEE_COL_WIDTH }} className="shrink-0 px-3 py-3 text-xs font-medium text-gray-700 border-l border-gray-100">
                  Assignee
                </div>
              )}
              {settings.showStart && (
                <div style={{ width: START_COL_WIDTH }} className="shrink-0 px-3 py-3 text-xs font-medium text-gray-700 border-l border-gray-100">
                  Start
                </div>
              )}
              {settings.showEnd && (
                <div style={{ width: END_COL_WIDTH }} className="shrink-0 px-3 py-3 text-xs font-medium text-gray-700 border-l border-gray-100">
                  Due
                </div>
              )}
            </div>
            {columns.map((c) => (
              <div
                key={c.key}
                style={{ width: c.width }}
                className={`shrink-0 py-3 text-[11px] whitespace-nowrap text-center border-r border-gray-100 ${
                  c.weekend ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {c.label || " "}
              </div>
            ))}
          </div>

          {/* Inline create-epic row */}
          <TimelineCreateEpic
            projectId={projectId}
            members={members}
            currentUserId={currentUserId}
            columns={columns}
            leftWidth={leftWidth}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />

          {/* Epic rows (recursive children load on expand). Narrow to a single
              epic when the epic filter is set, and drop done epics when hiding. */}
          {(filterEpicId ? epics.filter((e) => e.id === filterEpicId) : epics)
            .filter(
              (e) => !(settings.hideDone && statusesById.get(e.statusId)?.category === "DONE"),
            )
            .map((e) => (
              <TimelineRow
                key={e.id}
                issue={e}
                level={0}
                projectId={projectId}
                columns={columns}
                onOpen={setOpenIssueId}
                assigneeFilter={assigneeFilter}
                settings={settings}
                statusesById={statusesById}
                membersById={membersById}
                leftWidth={leftWidth}
              />
            ))}

          {/* Empty / sentinel rows */}
          {loaded && epics.length === 0 && (
            <div className="flex">
              <div
                style={{ width: leftWidth }}
                className="shrink-0 px-4 py-6 text-xs text-gray-500 border-r border-gray-200 sticky left-0 bg-white z-[15]"
              >
                No epics yet — create one above.
              </div>
              <div className="shrink-0" style={{ width: stripWidth }} />
            </div>
          )}

          {hasMore && (
            <div className="flex border-b border-gray-50">
              <div
                ref={sentinelRef}
                style={{ width: leftWidth }}
                className="shrink-0 h-8 px-4 border-r border-gray-200 sticky left-0 bg-white z-[15] flex items-center text-[11px] text-gray-400"
              >
                {loading ? "Loading more epics…" : ""}
              </div>
              <div className="shrink-0" style={{ width: stripWidth }} />
            </div>
          )}

          {/* Connection arrows: hierarchy (parent→child) + dependency links.
              Drawn over the strip, behind the bars, only between rendered rows. */}
          <TimelineConnections
            contentRef={contentRef}
            depEdges={depEdges}
            columns={columns}
            leftWidth={leftWidth}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] shrink-0">
        <span className="font-semibold uppercase tracking-wider text-gray-500">Legend</span>
        <LegendChip color="#6b7280" label="To do" />
        <LegendChip color="#2563eb" label="In progress" />
        <LegendChip color="#16a34a" label="Done" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-gray-600">
          <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" stroke="#2563eb" strokeWidth="1.5" />
            <path d="M14 1 L20 4 L14 7 z" fill="#2563eb" />
          </svg>
          Dependency
        </span>
        <span className="inline-flex items-center gap-1.5 text-gray-600">
          <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden>
            <line x1="0" y1="4" x2="18" y2="4" stroke="#cbd5e1" strokeWidth="1.25" strokeDasharray="3 3" />
          </svg>
          Parent–child
        </span>
      </div>

      {/* Floating zoom control */}
      <div className="absolute bottom-12 right-6 flex items-center bg-white border border-gray-200 rounded-md shadow-sm">
        {(["week", "month", "quarter"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-3 h-8 text-xs font-medium capitalize border-r border-gray-200 last:border-r-0 ${
              zoom === z ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            {z}
          </button>
        ))}
      </div>

      <EditIssueModal
        open={openIssueId !== null}
        issueId={openIssueId}
        projectId={projectId}
        onClose={() => setOpenIssueId(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
