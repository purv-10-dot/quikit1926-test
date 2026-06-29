"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Zap, CheckSquare, Bug, BookOpen, Link2 } from "lucide-react";
import type { Col, TimelineIssue } from "./timeline-meta";
import { WORK_COL_WIDTH, intervalToBar, totalGridWidth } from "./timeline-meta";

const PAGE_SIZE = 25;

const TYPE_ICON = (type: string) => {
  if (type === "EPIC") return { Icon: Zap, color: "text-purple-500" };
  if (type === "BUG") return { Icon: Bug, color: "text-red-500" };
  if (type === "STORY") return { Icon: BookOpen, color: "text-green-600" };
  if (type === "SUBTASK") return { Icon: Link2, color: "text-blue-500" };
  return { Icon: CheckSquare, color: "text-blue-500" };
};

/**
 * Recursive row used at every level of the timeline hierarchy:
 *   - Level 0 (epic):   children fetched with ?epicId=&excludeType=EPIC,SUBTASK
 *   - Level 1 (task):   children fetched with ?parentId=&type=SUBTASK
 *   - Level 2 (subtask) is a leaf — no further children.
 *
 * Owns its own pagination + IntersectionObserver sentinel: scrolling near the
 * bottom of an expanded group fetches the next page. Children are not loaded
 * until the row is expanded for the first time.
 */
export function TimelineRow({
  issue,
  level,
  projectId,
  columns,
  onOpen,
  assigneeFilter = "",
}: {
  issue: TimelineIssue;
  level: number; // 0 = epic, 1 = task, 2 = subtask
  projectId: string;
  columns: Col[];
  onOpen?: (id: string) => void;
  /** Comma-separated assignee ids; narrows the child tasks/subtasks shown. */
  assigneeFilter?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TimelineIssue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const canExpand =
    issue.type === "EPIC" || (issue.type !== "SUBTASK" && (issue.subtaskCount ?? 0) > 0);

  const loadChildren = useCallback(
    async (initial = false) => {
      if (loading) return;
      if (!initial && !hasMore) return;
      setLoading(true);
      const params = new URLSearchParams({
        projectId,
        limit: String(PAGE_SIZE),
      });
      if (issue.type === "EPIC") {
        params.set("epicId", issue.id);
        params.set("excludeType", "EPIC,SUBTASK");
      } else {
        params.set("parentId", issue.id);
        params.set("type", "SUBTASK");
      }
      if (assigneeFilter) params.set("assigneeId", assigneeFilter);
      if (!initial && cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
        if (res?.success) {
          setChildren((prev) => (initial ? res.data : [...prev, ...res.data]));
          setCursor(res.nextCursor ?? null);
          setHasMore(!!res.nextCursor);
          setLoaded(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, issue.id, issue.type, cursor, hasMore, loading, assigneeFilter],
  );

  useEffect(() => {
    if (expanded && !loaded) void loadChildren(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, loaded]);

  // Re-fetch already-loaded children when the assignee filter changes.
  useEffect(() => {
    if (!loaded) return;
    setChildren([]);
    setCursor(null);
    setHasMore(false);
    setLoaded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeFilter]);

  useEffect(() => {
    if (!expanded || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loading) void loadChildren(false);
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [expanded, hasMore, loading, loadChildren]);

  const T = TYPE_ICON(issue.type);
  const bar = intervalToBar(issue.startDate, issue.dueDate, columns);
  const stripWidth = totalGridWidth(columns);

  return (
    <>
      <div className="flex border-b border-gray-100">
        {/* Sticky left side: chevron + indent + icon + title */}
        <div
          style={{ width: WORK_COL_WIDTH, paddingLeft: 12 + level * 16 }}
          className="shrink-0 h-10 flex items-center pr-3 border-r border-gray-200 sticky left-0 bg-white z-[15]"
        >
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-0.5 -ml-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <T.Icon className={`h-3.5 w-3.5 mx-1.5 shrink-0 ${T.color}`} />
          <button
            type="button"
            onClick={() => onOpen?.(issue.id)}
            className="text-xs text-gray-800 truncate hover:underline text-left flex-1 min-w-0"
            title={issue.title}
          >
            {issue.title}
            {typeof issue.subtaskCount === "number" && issue.subtaskCount > 0 && (
              <span className="ml-1 text-gray-500">({issue.subtaskCount})</span>
            )}
          </button>
        </div>

        {/* Right side: timeline strip + bar */}
        <div className="relative shrink-0" style={{ width: stripWidth }}>
          {/* Light vertical column separators inside the strip. */}
          <div className="absolute inset-0 flex">
            {columns.map((c) => (
              <div
                key={c.key}
                style={{ width: c.width }}
                className="shrink-0 border-r border-gray-100"
              />
            ))}
          </div>
          {bar && (
            <button
              type="button"
              onClick={() => onOpen?.(issue.id)}
              style={{
                left: bar.left + 4,
                width: bar.width - 8,
                top: 6,
              }}
              className={`absolute h-7 px-2 rounded border text-[11px] font-medium truncate text-left ${
                level === 0
                  ? "bg-purple-50 border-purple-300 text-purple-800"
                  : level === 1
                    ? "bg-blue-50 border-blue-300 text-blue-800"
                    : "bg-gray-50 border-gray-300 text-gray-800"
              }`}
              title={issue.title}
            >
              {issue.title}
            </button>
          )}
        </div>
      </div>

      {expanded &&
        children.map((c) => (
          <TimelineRow
            key={c.id}
            issue={c}
            level={level + 1}
            projectId={projectId}
            columns={columns}
            onOpen={onOpen}
            assigneeFilter={assigneeFilter}
          />
        ))}

      {expanded && hasMore && (
        <div className="flex border-b border-gray-50">
          <div
            ref={sentinelRef}
            style={{ width: WORK_COL_WIDTH, paddingLeft: 12 + (level + 1) * 16 }}
            className="shrink-0 h-8 border-r border-gray-200 sticky left-0 bg-white z-[15] flex items-center text-[10px] text-gray-400"
          >
            {loading ? "Loading…" : ""}
          </div>
          <div className="shrink-0" style={{ width: stripWidth }} />
        </div>
      )}
    </>
  );
}
