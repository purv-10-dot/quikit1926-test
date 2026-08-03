"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  CheckSquare,
  Bug,
  BookOpen,
  Link2,
  AlertTriangle,
} from "lucide-react";
import type { Col, Member, TimelineIssue } from "./timeline-meta";
import {
  WORK_COL_WIDTH,
  intervalToBar,
  totalGridWidth,
  fullName,
} from "./timeline-meta";
import {
  STATUS_COL_WIDTH,
  ASSIGNEE_COL_WIDTH,
  START_COL_WIDTH,
  END_COL_WIDTH,
  categoryColor,
  progressForCategory,
  type TimelineStatus,
  type TimelineViewSettings,
} from "./timeline-view-settings";
import { StatusEditor, AssigneeEditor } from "./timeline-inline-edit";

const PAGE_SIZE = 25;

const TYPE_ICON = (type: string) => {
  if (type === "EPIC") return { Icon: Zap, color: "text-purple-500" };
  if (type === "BUG") return { Icon: Bug, color: "text-red-500" };
  if (type === "STORY") return { Icon: BookOpen, color: "text-green-600" };
  if (type === "SUBTASK") return { Icon: Link2, color: "text-blue-500" };
  return { Icon: CheckSquare, color: "text-blue-500" };
};

const TYPE_LABEL: Record<string, string> = {
  EPIC: "Epic",
  TASK: "Task",
  STORY: "Story",
  BUG: "Bug",
  SUBTASK: "Subtask",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueDate: string | null, category: string | undefined): boolean {
  if (!dueDate || category === "DONE") return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

interface RowProps {
  issue: TimelineIssue;
  level: number; // 0 = epic, 1 = task, 2 = subtask
  projectId: string;
  columns: Col[];
  onOpen?: (id: string) => void;
  assigneeFilter?: string;
  settings: TimelineViewSettings;
  statusesById: Map<string, TimelineStatus>;
  membersById: Map<string, Member>;
  leftWidth: number;
}

/**
 * Recursive row used at every level of the timeline hierarchy. Children fetch
 * lazily on expand. Renders optional Status/Assignee columns, a warning marker,
 * and a status- or custom-colored bar per the view settings.
 */
export function TimelineRow(props: RowProps) {
  const {
    issue,
    level,
    projectId,
    columns,
    onOpen,
    assigneeFilter = "",
    settings,
    statusesById,
    membersById,
    leftWidth,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TimelineIssue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const canExpand =
    issue.type === "EPIC" || (issue.type !== "SUBTASK" && (issue.subtaskCount ?? 0) > 0);

  const loadChildren = useCallback(
    async (initial = false) => {
      if (loading) return;
      if (!initial && !hasMore) return;
      setLoading(true);
      const params = new URLSearchParams({ projectId, limit: String(PAGE_SIZE) });
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

  // Local optimistic copies of the two inline-editable fields — reset whenever
  // the underlying issue changes (e.g. a parent refetch).
  const [localStatusId, setLocalStatusId] = useState(issue.statusId);
  const [localAssigneeId, setLocalAssigneeId] = useState<string | null>(issue.assigneeId ?? null);
  useEffect(() => setLocalStatusId(issue.statusId), [issue.statusId]);
  useEffect(() => setLocalAssigneeId(issue.assigneeId ?? null), [issue.assigneeId]);

  // Inline edit → optimistic update, PATCH, revert on failure, broadcast so
  // other views (board/backlog/etc.) re-sync.
  async function patchField(body: { statusId?: string; assigneeId?: string | null }) {
    const prevStatus = localStatusId;
    const prevAssignee = localAssigneeId;
    if (body.statusId !== undefined) setLocalStatusId(body.statusId);
    if (body.assigneeId !== undefined) setLocalAssigneeId(body.assigneeId);
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!res?.success) throw new Error(res?.error ?? "Update failed");
      window.dispatchEvent(
        new CustomEvent("quiktrack:issue-updated", { detail: { projectId, issueId: issue.id } }),
      );
    } catch {
      setLocalStatusId(prevStatus);
      setLocalAssigneeId(prevAssignee);
    }
  }

  const T = TYPE_ICON(issue.type);
  const bar = intervalToBar(issue.startDate, issue.dueDate, columns);
  const stripWidth = totalGridWidth(columns);

  const status = statusesById.get(localStatusId);
  const statusHex = status?.color || categoryColor(status?.category);
  const barHex = settings.barColor === "custom" ? settings.customColor : statusHex;
  const progress = progressForCategory(status?.category);
  const assignee = localAssigneeId ? membersById.get(localAssigneeId) ?? null : null;

  const overdue = isOverdue(issue.dueDate, status?.category);
  const undated = !issue.startDate && !issue.dueDate;
  const warn = settings.showWarnings && (overdue || undated);

  const visibleChildren = settings.hideDone
    ? children.filter((c) => statusesById.get(c.statusId)?.category !== "DONE")
    : children;

  return (
    <>
      <div className="flex border-b border-gray-100">
        {/* Frozen left: Work + optional Status/Assignee columns. */}
        <div
          style={{ width: leftWidth }}
          className="shrink-0 flex sticky left-0 bg-white z-[15] border-r border-gray-200"
        >
          <div
            style={{ width: WORK_COL_WIDTH, paddingLeft: 12 + level * 16 }}
            className="shrink-0 h-10 flex items-center pr-3"
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
            {warn && (
              <AlertTriangle
                className="ml-1.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                aria-label={overdue ? "Overdue" : "No dates set"}
              />
            )}
          </div>

          {settings.showStatus && (
            <div
              style={{ width: STATUS_COL_WIDTH }}
              className="shrink-0 h-10 flex items-center px-2 border-l border-gray-100"
            >
              <StatusEditor
                issueId={issue.id}
                projectId={projectId}
                value={localStatusId}
                statuses={Array.from(statusesById.values())}
                onSelect={(id) => void patchField({ statusId: id })}
              />
            </div>
          )}

          {settings.showAssignee && (
            <div
              style={{ width: ASSIGNEE_COL_WIDTH }}
              className="shrink-0 h-10 flex items-center gap-2 px-2 border-l border-gray-100"
            >
              <AssigneeEditor
                value={localAssigneeId}
                members={Array.from(membersById.values())}
                onSelect={(id) => void patchField({ assigneeId: id })}
              />
            </div>
          )}

          {settings.showStart && (
            <div
              style={{ width: START_COL_WIDTH }}
              className="shrink-0 h-10 flex items-center px-3 border-l border-gray-100 text-[11px] tabular-nums text-gray-600"
            >
              {fmtDate(issue.startDate)}
            </div>
          )}
          {settings.showEnd && (
            <div
              style={{ width: END_COL_WIDTH }}
              className="shrink-0 h-10 flex items-center px-3 border-l border-gray-100 text-[11px] tabular-nums"
            >
              <span className={overdue ? "font-medium text-red-600" : "text-gray-600"}>
                {fmtDate(issue.dueDate)}
              </span>
            </div>
          )}
        </div>

        {/* Right side: timeline strip + bar */}
        <div className="relative shrink-0" style={{ width: stripWidth }}>
          {/* Weekend-tinted day columns. */}
          <div className="absolute inset-0 flex pointer-events-none">
            {columns.map((c) => (
              <div
                key={c.key}
                style={{ width: c.width }}
                className={`shrink-0 border-r border-gray-100 ${c.weekend ? "bg-gray-50/70" : ""}`}
              />
            ))}
          </div>
          {bar && (
            <button
              type="button"
              data-timeline-bar
              data-issue-id={issue.id}
              data-parent-id={issue.parentId ?? issue.epicId ?? ""}
              onClick={() => onOpen?.(issue.id)}
              onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTip(null)}
              style={{
                left: bar.left + 2,
                width: bar.width - 4,
                top: 6,
                zIndex: 2,
                backgroundColor: barHex,
                boxShadow: `0 1px 2px rgba(0,0,0,0.12), 0 0 0 2px ${barHex}33`,
              }}
              className="absolute h-7 overflow-hidden rounded-md"
              aria-label={`${issue.key} ${issue.title}`}
            >
              {/* Progress fill (derived from status) — darkens the done portion. */}
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: `${progress}%`, backgroundColor: "rgba(0,0,0,0.24)" }}
              />
              {bar.width >= 34 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tracking-wide text-white pointer-events-none">
                  {progress}%
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Rich hover tooltip — full issue details, portaled so the scroll
          container can't clip it. */}
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-64 rounded-md border border-gray-200 bg-white p-2.5 text-xs shadow-lg"
            style={{
              left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 272),
              top: tip.y + 14,
            }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-gray-900">
              <T.Icon className={`h-3.5 w-3.5 shrink-0 ${T.color}`} />
              <span className="truncate">
                {issue.key} · {issue.title}
              </span>
            </div>
            <dl className="mt-2 space-y-1 text-gray-600">
              <TipRow label="Type">{TYPE_LABEL[issue.type] ?? issue.type}</TipRow>
              <TipRow label="Status">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusHex }} />
                  {status?.name ?? "—"}
                </span>
              </TipRow>
              <TipRow label="Assignee">{assignee ? fullName(assignee) : "Unassigned"}</TipRow>
              <TipRow label="Start">{fmtDate(issue.startDate)}</TipRow>
              <TipRow label="Due">
                <span className={overdue ? "font-medium text-red-600" : ""}>
                  {fmtDate(issue.dueDate)}
                </span>
              </TipRow>
            </dl>
          </div>,
          document.body,
        )}

      {expanded &&
        visibleChildren.map((c) => (
          <TimelineRow
            key={c.id}
            issue={c}
            level={level + 1}
            projectId={projectId}
            columns={columns}
            onOpen={onOpen}
            assigneeFilter={assigneeFilter}
            settings={settings}
            statusesById={statusesById}
            membersById={membersById}
            leftWidth={leftWidth}
          />
        ))}

      {expanded && hasMore && (
        <div className="flex border-b border-gray-50">
          <div
            ref={sentinelRef}
            style={{ width: leftWidth, paddingLeft: 12 + (level + 1) * 16 }}
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

function TipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-16 shrink-0 text-gray-400">{label}</dt>
      <dd className="flex-1 min-w-0 truncate text-gray-700">{children}</dd>
    </div>
  );
}
