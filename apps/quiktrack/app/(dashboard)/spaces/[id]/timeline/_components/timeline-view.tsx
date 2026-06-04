"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Sliders,
  MoreHorizontal,
  Info,
  Check,
  X,
} from "lucide-react";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import type { Col, Member, TimelineIssue, ZoomLevel } from "./timeline-meta";
import {
  WORK_COL_WIDTH,
  ZOOM_PRESETS,
  buildColumns,
  dateToX,
  totalGridWidth,
} from "./timeline-meta";
import { TimelineRow } from "./timeline-row";
import { TimelineCreateEpic } from "./timeline-create-epic";

const ROOT_PAGE_SIZE = 20;

/**
 * Timeline view. Shows all epics for the project (paginated by scroll); each
 * epic expands to show its tasks (paginated by scroll); each task expands to
 * show its subtasks (paginated by scroll). All children are fetched lazily
 * via /api/issues with the appropriate filters — nothing below the visible
 * row is loaded upfront.
 */
export function TimelineView({ projectId }: { projectId: string }) {
  const [zoom, setZoom] = useState<ZoomLevel>("months");
  const [search, setSearch] = useState("");
  // Debounced copy fed into the API — avoids hammering /api/issues on every keystroke.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusCategory, setStatusCategory] = useState<
    "BACKLOG" | "IN_PROGRESS" | "DONE" | null
  >(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusBtnRef = useRef<HTMLDivElement>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

  // Root-level epics with cursor pagination.
  const [epics, setEpics] = useState<TimelineIssue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<Col[]>(
    () => buildColumns(zoom, ZOOM_PRESETS[zoom].count),
    [zoom],
  );
  const stripWidth = totalGridWidth(columns);

  const todayX = useMemo(() => dateToX(new Date(), columns), [columns]);

  // Boot: fetch members + session.
  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) {
          const list = Array.isArray(j.data?.members)
            ? j.data.members
            : Array.isArray(j.data)
              ? j.data
              : [];
          setMembers(list);
        }
      })
      .catch(() => undefined);
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
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const list = Array.isArray(j.data?.members)
          ? j.data.members
          : Array.isArray(j.data)
            ? j.data
            : [];
        setMembers(list);
      })
      .catch(() => undefined);
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
        if (statusCategory) params.set("statusCategory", statusCategory);
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
    [projectId, appliedSearch, statusCategory, cursor, hasMore, loading],
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
  }, [projectId, appliedSearch, statusCategory, refreshKey]);

  // Close the status dropdown on outside click.
  useEffect(() => {
    if (!statusOpen) return;
    function onDown(e: MouseEvent) {
      if (!statusBtnRef.current?.contains(e.target as Node)) setStatusOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [statusOpen]);

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
          <div ref={statusBtnRef} className="relative">
            <button
              type="button"
              onClick={() => setStatusOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs border rounded-md hover:bg-gray-50 ${
                statusCategory
                  ? "border-blue-500 text-blue-700 bg-blue-50"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              {statusCategory
                ? statusCategory === "IN_PROGRESS"
                  ? "In progress"
                  : statusCategory === "DONE"
                    ? "Done"
                    : "Backlog"
                : "Status category"}
              {statusCategory ? (
                <X
                  className="h-3.5 w-3.5 text-blue-500 hover:text-blue-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatusCategory(null);
                    setStatusOpen(false);
                  }}
                />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              )}
            </button>
            {statusOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
                {(
                  [
                    ["BACKLOG", "Backlog"],
                    ["IN_PROGRESS", "In progress"],
                    ["DONE", "Done"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatusCategory(value);
                      setStatusOpen(false);
                    }}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <span>{label}</span>
                    {statusCategory === value && (
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600" aria-label="Settings">
            <Sliders className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600" aria-label="More">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid — explicit width on the inner div + overflow-x:scroll guarantees
          a horizontal scrollbar even when the parent layout doesn't propagate
          its width. */}
      <div className="flex-1 overflow-x-scroll overflow-y-auto">
        <div
          className="relative"
          style={{ width: WORK_COL_WIDTH + stripWidth }}
        >
          {/* Today indicator */}
          {todayX != null && (
            <div
              className="absolute top-10 bottom-0 w-px bg-blue-500 z-[5] pointer-events-none"
              style={{ left: WORK_COL_WIDTH + todayX }}
            />
          )}

          {/* Header row */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-20">
            <div
              style={{ width: WORK_COL_WIDTH }}
              className="shrink-0 px-4 py-3 text-xs font-medium text-gray-700 border-r border-gray-200 sticky left-0 bg-white z-10"
            >
              Work
            </div>
            {columns.map((c) => (
              <div
                key={c.key}
                style={{ width: c.width }}
                className="shrink-0 px-4 py-3 text-xs font-medium text-gray-700 border-r border-gray-200 text-center"
              >
                {c.label}
              </div>
            ))}
          </div>

          {/* Inline create-epic row */}
          <TimelineCreateEpic
            projectId={projectId}
            members={members}
            currentUserId={currentUserId}
            columns={columns}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />

          {/* Epic rows (recursive children load on expand) */}
          {epics.map((e) => (
            <TimelineRow
              key={e.id}
              issue={e}
              level={0}
              projectId={projectId}
              columns={columns}
              onOpen={setOpenIssueId}
            />
          ))}

          {/* Empty / sentinel rows */}
          {loaded && epics.length === 0 && (
            <div className="flex">
              <div
                style={{ width: WORK_COL_WIDTH }}
                className="shrink-0 px-4 py-6 text-xs text-gray-500 border-r border-gray-200"
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
                style={{ width: WORK_COL_WIDTH }}
                className="shrink-0 h-8 px-4 border-r border-gray-200 sticky left-0 bg-white z-[15] flex items-center text-[11px] text-gray-400"
              >
                {loading ? "Loading more epics…" : ""}
              </div>
              <div className="shrink-0" style={{ width: stripWidth }} />
            </div>
          )}
        </div>
      </div>

      {/* Floating zoom control (visual only for now) */}
      <div className="absolute bottom-4 right-6 flex items-center bg-white border border-gray-200 rounded-md shadow-sm">
        {(["today", "weeks", "months", "quarters"] as ZoomLevel[]).map((z) => (
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
        <button
          className="px-2 h-8 text-gray-500 hover:bg-gray-50 border-l border-gray-200"
          aria-label="Info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        <button
          className="px-2 h-8 text-gray-500 hover:bg-gray-50 border-l border-gray-200"
          aria-label="Next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
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
