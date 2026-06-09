"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  Settings as SettingsIcon,
  MoreHorizontal,
  User as UserIcon,
  X,
} from "lucide-react";
import type { BoardStatus, EpicLite } from "./board-meta";
import { BoardColumn } from "./board-column";
import { AddColumnTile } from "./add-column-tile";
import { BoardFilterSelect, type BoardFilterOption } from "./board-filter-select";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";

// The edit-issue modal pulls in the full rich-text editor (~17 tiptap packages).
// It only renders when a card is opened, so load it on demand to keep it out of
// the board's initial bundle.
const EditIssueModal = dynamic(
  () => import("@/components/edit-issue-modal").then((m) => m.EditIssueModal),
  { ssr: false },
);

interface BoardMember {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar?: string | null;
  } | null;
}

export interface BoardFilters {
  search: string;
  assigneeId: string;
  type: string;
  priority: string;
}

const EMPTY_FILTERS: BoardFilters = { search: "", assigneeId: "", type: "", priority: "" };

// Stable hash → consistent member-avatar color (cribbed from backlog-view).
function memberColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}deg 45% 50%)`;
}

export function BoardView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<BoardStatus[]>([]);
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [allSprints, setAllSprints] = useState<{ id: string; name: string; status: string }[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [epicsById, setEpicsById] = useState<Record<string, EpicLite>>({});
  // Shared with the backlog + work-item views via the same query key, so the
  // avatar stack is cached across navigation and the dev StrictMode double-fetch
  // collapses to one request. (Statuses stay local — the board edits them.)
  const { data: members = [] } = useApiData<BoardMember[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: BoardMember[] } | BoardMember[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );

  // Search input + debounced applied search the API actually uses.
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const filters = useMemo<BoardFilters>(
    () => ({ search: appliedSearch, assigneeId: filterAssigneeId, type: filterType, priority: filterPriority }),
    [appliedSearch, filterAssigneeId, filterType, filterPriority],
  );

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [statusesRes, sprintsRes, epicsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/statuses`).then((r) => r.json()),
        fetch(`/api/sprints?projectId=${projectId}`).then((r) => r.json()),
        fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=200`).then((r) => r.json()),
      ]);
      if (!alive) return;
      if (statusesRes?.success) setStatuses(statusesRes.data || []);
      const sprintList: Array<{ id: string; name: string; status: string }> =
        sprintsRes?.success ? sprintsRes.data ?? [] : [];
      setAllSprints(sprintList);
      // Parallel sprints are allowed (Jira-parity). The board shows the
      // union of every currently-ACTIVE sprint's work; we pass the joined
      // id list to /api/issues, which interprets a comma-separated
      // `sprintId` as an IN-list (see issues/route.ts).
      const actives = sprintList.filter((s) => s.status === "ACTIVE");
      setActiveSprintId(actives.length > 0 ? actives.map((s) => s.id).join(",") : null);
      if (epicsRes?.success) {
        const map: Record<string, EpicLite> = {};
        for (const e of epicsRes.data ?? []) {
          map[e.id] = { id: e.id, key: e.key, title: e.title };
        }
        setEpicsById(map);
      }
      setBootLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Refetch members when someone is added/removed via the Add-people modal —
  // invalidate the shared query so the avatar stack (and every other view)
  // updates without a page reload.
  useMembersChanged(projectId, () => {
    void queryClient.invalidateQueries({
      queryKey: ["quiktrack", "project-members", projectId],
    });
  });

  // Refresh whenever an issue is created or updated elsewhere — each column
  // watches the same event and refetches its first page, so the board stays
  // honest without a global force-reload.
  useEffect(() => {
    function refresh() {
      setRefreshKey((k) => k + 1);
    }
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setOpenIssueId(id);
    }
    window.addEventListener("quiktrack:issue-created", refresh);
    window.addEventListener("quiktrack:issue-updated", refresh);
    window.addEventListener("quiktrack:open-issue", onOpen);
    return () => {
      window.removeEventListener("quiktrack:issue-created", refresh);
      window.removeEventListener("quiktrack:issue-updated", refresh);
      window.removeEventListener("quiktrack:open-issue", onOpen);
    };
  }, []);
  const [refreshKey, setRefreshKey] = useState(0);

  const visibleStatuses = statuses.filter((s) => !s.isHidden);
  const statusesById = Object.fromEntries(statuses.map((s) => [s.id, s]));

  // Drag-to-reorder columns AND drag-to-move issues between columns. Both
  // share the same column drop target, but use different MIME types so the
  // drop handler can tell them apart.
  function onColDragStart(id: string) {
    return (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/quiktrack-column", id);
    };
  }
  function onColDragOver(e: React.DragEvent) {
    // Accept either an issue drop or a column reorder.
    if (
      e.dataTransfer.types.includes("application/quiktrack-issue") ||
      e.dataTransfer.types.includes("application/quiktrack-column")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }
  function onColDrop(targetId: string) {
    return async (e: React.DragEvent) => {
      // Issue → column move (PATCH the issue's statusId).
      const issueId = e.dataTransfer.getData("application/quiktrack-issue");
      if (issueId) {
        e.preventDefault();
        try {
          const res = await fetch(`/api/issues/${issueId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statusId: targetId }),
          }).then((r) => r.json());
          if (res?.success) {
            window.dispatchEvent(
              new CustomEvent("quiktrack:issue-updated", {
                detail: { projectId, issueId },
              }),
            );
          }
        } catch {
          // ignore — next refresh reconciles
        }
        return;
      }

      // Column reorder.
      const src = e.dataTransfer.getData("application/quiktrack-column");
      if (!src || src === targetId) return;
      e.preventDefault();
      const order = statuses.map((s) => s.id);
      const fromIdx = order.indexOf(src);
      const toIdx = order.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...order];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, src);
      setStatuses(
        (prev) =>
          next.map((id) => prev.find((s) => s.id === id)).filter(Boolean) as BoardStatus[],
      );
      try {
        await fetch(`/api/projects/${projectId}/statuses/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds: next }),
        });
      } catch {
        // ignore
      }
    };
  }

  return (
    // `min-w-0` is essential — without it, the inner overflow-x-auto can't
    // create a scroll context because the parent flex/grid chain tries to
    // size to content. With many columns + parallel sprints in play the
    // board easily exceeds the viewport width, so we let the inner column
    // strip own the horizontal scrollbar.
    <div className="px-6 py-4 min-w-0">
      <Toolbar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        members={members}
        filterAssigneeId={filterAssigneeId}
        setFilterAssigneeId={setFilterAssigneeId}
        filterType={filterType}
        setFilterType={setFilterType}
        filterPriority={filterPriority}
        setFilterPriority={setFilterPriority}
        onClearAll={() => {
          setSearchInput("");
          setFilterAssigneeId("");
          setFilterType("");
          setFilterPriority("");
        }}
      />

      {/* qt-board-scroll (globals.css) — slim rounded always-visible
          horizontal scrollbar styled specifically for the board pane.
          The strip fills the remaining vertical space so the bar sits
          at the bottom of the viewport, matching Jira's pattern. */}
      <div
        className="flex gap-3 overflow-x-scroll w-full qt-board-scroll pb-2"
        style={{ minHeight: "calc(100vh - 220px)" }}
      >
        {bootLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="w-[300px] shrink-0 bg-gray-50 rounded p-2 min-h-[480px] space-y-2"
            >
              <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="bg-white rounded border border-gray-200 p-3">
                  <div className="h-3 w-full rounded bg-gray-200 animate-pulse mb-2" />
                  <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
                </div>
              ))}
            </div>
          ))}

        {!bootLoading &&
          activeSprintId &&
          visibleStatuses.map((s) => (
            <BoardColumn
              key={`${s.id}-${refreshKey}`}
              status={s}
              allStatuses={visibleStatuses}
              projectId={projectId}
              sprintId={activeSprintId}
              epicsById={epicsById}
              statusesById={statusesById}
              filters={filters}
              members={members}
              availableSprints={allSprints.filter((sp) => sp.status !== "COMPLETED")}
              onOpen={setOpenIssueId}
              onColumnRenamed={(updated) =>
                setStatuses((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onColumnDeleted={(id) =>
                setStatuses((prev) => prev.filter((x) => x.id !== id))
              }
              dragHandlers={{
                onDragStart: onColDragStart(s.id),
                onDragOver: onColDragOver,
                onDrop: onColDrop(s.id),
              }}
            />
          ))}

        {/* No active sprint — render the column shells empty, and put the
            "Get started in the backlog" CTA inside the first column so the
            board structure stays visible (matches Jira's behaviour). */}
        {!bootLoading &&
          !activeSprintId &&
          visibleStatuses.map((s, idx) => (
            <EmptyColumn
              key={s.id}
              name={s.name}
              showCta={idx === 0}
              projectId={projectId}
            />
          ))}

        {!bootLoading && (
          <AddColumnTile
            projectId={projectId}
            defaultCategory="BACKLOG"
            onCreated={(s) => setStatuses((prev) => [...prev, s])}
          />
        )}
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

function Toolbar({
  searchInput,
  onSearchChange,
  members,
  filterAssigneeId,
  setFilterAssigneeId,
  filterType,
  setFilterType,
  filterPriority,
  setFilterPriority,
  onClearAll,
}: {
  searchInput: string;
  onSearchChange: (v: string) => void;
  members: BoardMember[];
  filterAssigneeId: string;
  setFilterAssigneeId: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  filterPriority: string;
  setFilterPriority: (v: string) => void;
  onClearAll: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      // Inner selects portal their option menu to document.body. A click there
      // is visually inside the filter popover but lives outside `filterRef` —
      // don't let it close (and unmount) the popover before the option's click
      // handler runs, or the filter value never applies.
      if (t.closest?.("[data-portal-popover]")) return;
      if (filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFilterOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const visibleMembers = members
    .filter((m): m is BoardMember & { user: NonNullable<BoardMember["user"]> } => Boolean(m.user))
    .slice(0, 5);
  const overflow = Math.max(0, members.filter((m) => m.user).length - visibleMembers.length);
  const toggleAssignee = (id: string) => setFilterAssigneeId(filterAssigneeId === id ? "" : id);

  const activeCount =
    (filterAssigneeId ? 1 : 0) +
    (filterType ? 1 : 0) +
    (filterPriority ? 1 : 0);
  const hasAnyActive = activeCount > 0 || searchInput.trim().length > 0;

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search board"
            className="h-8 pl-8 pr-3 text-sm border border-gray-300 rounded w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center -space-x-1.5">
          <button
            type="button"
            onClick={() => toggleAssignee("null")}
            title="Unassigned"
            className={`h-7 w-7 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center transition ${
              filterAssigneeId === "null" ? "outline outline-2 outline-blue-500 z-10" : "hover:bg-gray-200"
            }`}
          >
            <UserIcon className="h-3 w-3 text-gray-500" />
          </button>
          {visibleMembers.map((m) => {
            const u = m.user;
            const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
            const initials =
              (u.firstName?.[0] ?? u.email[0] ?? "?").toUpperCase() +
              (u.lastName?.[0] ?? "").toUpperCase();
            const active = filterAssigneeId === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleAssignee(u.id)}
                title={name}
                className={`h-7 w-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-semibold overflow-hidden transition ${
                  active ? "outline outline-2 outline-blue-500 z-10" : "hover:opacity-90"
                }`}
                style={{ background: memberColor(u.id), color: "white" }}
              >
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </button>
            );
          })}
          {overflow > 0 && (
            <span
              className="h-7 w-7 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-[10px] font-semibold text-gray-700"
              title={`${overflow} more — use Filter for the full list`}
            >
              +{overflow}
            </span>
          )}
        </div>

        <div ref={filterRef} className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm border rounded ${
              activeCount > 0
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white">
                {activeCount}
              </span>
            )}
          </button>
          {filterOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg">
              <BoardFilterSelect
                label="Assignee"
                value={filterAssigneeId}
                onChange={setFilterAssigneeId}
                options={(() => {
                  const opts: BoardFilterOption[] = [
                    { value: "", label: "Any" },
                    { value: "null", label: "Unassigned" },
                  ];
                  members
                    .filter((m): m is BoardMember & { user: NonNullable<BoardMember["user"]> } => Boolean(m.user))
                    .forEach((m) => {
                      const name =
                        [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").trim() || m.user.email;
                      opts.push({ value: m.user.id, label: name });
                    });
                  return opts;
                })()}
              />
              <BoardFilterSelect
                label="Type"
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: "", label: "Any" },
                  { value: "TASK", label: "Task" },
                  { value: "BUG", label: "Bug" },
                  { value: "STORY", label: "Story" },
                ]}
              />
              <BoardFilterSelect
                label="Priority"
                value={filterPriority}
                onChange={setFilterPriority}
                options={[
                  { value: "", label: "Any" },
                  { value: "HIGHEST", label: "Highest" },
                  { value: "HIGH", label: "High" },
                  { value: "MEDIUM", label: "Medium" },
                  { value: "LOW", label: "Low" },
                  { value: "LOWEST", label: "Lowest" },
                ]}
              />
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterAssigneeId("");
                    setFilterType("");
                    setFilterPriority("");
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {hasAnyActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
      {/* <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 h-8 px-3 text-sm border border-gray-300 rounded hover:bg-gray-50">
          Group
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100">
          <SettingsIcon className="h-3.5 w-3.5 text-gray-600" />
        </button>
        <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100">
          <MoreHorizontal className="h-3.5 w-3.5 text-gray-600" />
        </button>
      </div> */}
    </div>
  );
}

/**
 * Column shell shown when there's no active sprint. Same width / chrome as a
 * real column but with no fetch and no body content — except the first
 * column, which hosts the "Get started in the backlog" CTA.
 */
function EmptyColumn({
  name,
  showCta,
  projectId,
}: {
  name: string;
  showCta: boolean;
  projectId: string;
}) {
  return (
    <div className="w-[300px] shrink-0 bg-gray-50 rounded p-2 flex flex-col min-h-[480px]">
      <div className="px-1 mb-2 text-[11px] font-semibold tracking-wider uppercase text-gray-700">
        {name}
      </div>
      {showCta ? (
        <div className="flex-1 flex flex-col items-center text-center px-4 py-10">
          <CycleIllustration />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            Get started in the backlog
          </h3>
          <p className="mt-1 text-xs text-gray-600 max-w-[220px]">
            Plan and start a sprint to see work here.
          </p>
          <Link
            href={`/spaces/${projectId}/backlog`}
            className="mt-4 inline-flex items-center justify-center h-8 px-4 text-xs font-medium text-gray-800 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Go to Backlog
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function CycleIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cycleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      <path
        d="M60 18 A 42 42 0 1 1 18 60 L 30 60 A 30 30 0 1 0 60 30 Z"
        fill="url(#cycleGradient)"
      />
      <polygon points="60,8 60,28 78,18" fill="url(#cycleGradient)" />
    </svg>
  );
}
