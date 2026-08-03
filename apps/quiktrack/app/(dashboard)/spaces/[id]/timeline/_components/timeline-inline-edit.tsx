"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, User as UserIcon } from "lucide-react";
import { avatarColor, fullName, initials, type Member } from "./timeline-meta";
import { categoryColor, type TimelineStatus } from "./timeline-view-settings";
import { WorkflowStatusControl } from "@/components/workflow-status-control";

/**
 * Inline Status / Assignee editors for the timeline's frozen left column.
 *
 * The menus are portaled to <body> with fixed positioning because the timeline's
 * horizontal-scroll container clips overflow vertically too — an absolutely
 * positioned dropdown would be cut off at the row boundary.
 */

interface MenuPos {
  top: number;
  left: number;
}

function anchorBelow(el: HTMLElement): MenuPos {
  const r = el.getBoundingClientRect();
  return { top: r.bottom + 4, left: r.left };
}

/** Close on outside click or any scroll (the fixed menu can't follow scroll). */
function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-timeline-menu]")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, onClose]);
}

export function StatusEditor({
  issueId,
  projectId,
  value,
  statuses,
  disabled,
  onSelect,
}: {
  issueId: string;
  projectId: string;
  value: string;
  statuses: TimelineStatus[];
  disabled?: boolean;
  onSelect: (statusId: string) => void;
}) {
  const current = statuses.find((s) => s.id === value);
  return (
    <WorkflowStatusControl
      issueId={issueId}
      projectId={projectId}
      currentStatusId={value}
      currentStatusName={current?.name ?? "—"}
      currentStatusCategory={current?.category}
      statuses={statuses.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
      onChange={onSelect}
      onViewWorkflow={() => window.open(`/spaces/${projectId}/settings/workflows`, "_blank")}
      size="sm"
      disabled={disabled}
    />
  );
}

export function AssigneeEditor({
  value,
  members,
  disabled,
  onSelect,
}: {
  value: string | null;
  members: Member[];
  disabled?: boolean;
  onSelect: (assigneeId: string | null) => void;
}) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  useDismiss(pos !== null, () => setPos(null));

  const current = value ? members.find((m) => m.userId === value) ?? null : null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => fullName(m).toLowerCase().includes(q))
    : members;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        data-timeline-menu
        onClick={() => {
          setQuery("");
          setPos(pos ? null : anchorBelow(btnRef.current!));
        }}
        className="inline-flex max-w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-60"
      >
        {current ? (
          <>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ background: avatarColor(current.userId) }}
            >
              {initials(current)}
            </span>
            <span className="truncate text-[11px] text-gray-700">{fullName(current)}</span>
          </>
        ) : (
          <span className="text-[11px] text-gray-400">Unassigned</span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {pos &&
        createPortal(
          <div
            data-timeline-menu
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100 }}
            className="w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            <div className="px-2 pb-1">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="h-7 w-full rounded border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setPos(null);
                  onSelect(null);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                  <UserIcon className="h-3 w-3" />
                </span>
                Unassigned
              </button>
              {filtered.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    setPos(null);
                    onSelect(m.userId);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-50 ${
                    m.userId === value ? "bg-blue-50" : ""
                  }`}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                    style={{ background: avatarColor(m.userId) }}
                  >
                    {initials(m)}
                  </span>
                  <span className="flex-1 truncate text-gray-700">{fullName(m)}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-2.5 py-2 text-xs text-gray-400">No matches</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
