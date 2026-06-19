"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Check,
  ListTree,
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown as ChevronDownArrow,
  ChevronsDown,
  User as UserIcon,
} from "lucide-react";
import type { Priority } from "./types";

interface Subtask {
  id: string;
  key: string;
  title: string;
  priority?: Priority | null;
  assigneeId?: string | null;
  statusId?: string | null;
  status?: { id: string; name: string; category: string } | null;
}
interface Member {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

const PRIORITY_META: Record<Priority, { label: string; color: string; Icon: React.ElementType }> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
function userInitials(u: Member["user"]) {
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  return ((f[0] ?? "") + (l[0] ?? "")).toUpperCase() || (u.email[0] ?? "?").toUpperCase();
}
function statusPillClass(category?: string) {
  if (category === "DONE") return "qt-issue-status-pill qt-issue-status-pill--done bg-green-100 text-green-700";
  if (category === "IN_PROGRESS") return "qt-issue-status-pill qt-issue-status-pill--progress bg-blue-100 text-blue-700";
  return "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-100 text-gray-700";
}

function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return ref;
}

/**
 * One row in the SubtaskGrid. Owns its own popover state for the three
 * editable cells (priority / assignee / status). Mutations bubble up via
 * `onPatch` — the parent grid does the optimistic update + API call.
 */
export function SubtaskRow({
  subtask: s,
  projectId,
  members,
  statuses,
  onPatch,
}: {
  subtask: Subtask;
  projectId: string;
  members: Member[];
  statuses: { id: string; name: string; category: string }[];
  onPatch: (data: Record<string, unknown>) => void | Promise<void>;
}) {
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const priorityRef = useOutsideClose<HTMLDivElement>(priorityOpen, () => setPriorityOpen(false));
  const assigneeRef = useOutsideClose<HTMLDivElement>(assigneeOpen, () => setAssigneeOpen(false));
  const statusRef = useOutsideClose<HTMLDivElement>(statusOpen, () => setStatusOpen(false));

  const P = s.priority ? PRIORITY_META[s.priority] : null;
  const member = members.find((m) => m.userId === s.assigneeId);
  const cat = s.status?.category;

  return (
    <div className="grid grid-cols-[minmax(220px,2fr)_minmax(110px,1fr)_minmax(140px,1fr)_minmax(110px,1fr)_minmax(90px,0.7fr)] border-b border-gray-100 last:border-b-0 text-sm hover:bg-gray-50/60">
      <Link
        href={`/spaces/${projectId}/work/${s.id}`}
        className="flex items-center gap-2 px-3 py-2 min-w-0"
      >
        <ListTree className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        <span className="font-medium text-blue-600 hover:underline shrink-0">{s.key}</span>
        <span className="text-gray-800 truncate">{s.title}</span>
      </Link>

      <div className="px-3 py-2 relative" ref={priorityRef}>
        <button
          type="button"
          onClick={() => setPriorityOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
        >
          {P ? (
            <>
              <P.Icon className={`h-3.5 w-3.5 ${P.color}`} />
              <span className="text-gray-700">{P.label}</span>
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </button>
        {priorityOpen && (
          <div className="absolute left-2 top-full mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
            {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
              const m = PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    void onPatch({ priority: p });
                    setPriorityOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                    p === s.priority ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  {m.label}
                  {p === s.priority && <Check className="h-3 w-3 ml-auto" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-2 relative" ref={assigneeRef}>
        <button
          type="button"
          onClick={() => setAssigneeOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-gray-100"
        >
          {member?.user ? (
            <>
              <span
                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: avatarColor(member.userId) }}
              >
                {userInitials(member.user)}
              </span>
              <span className="text-gray-700 truncate max-w-[80px]">
                {member.user.firstName ?? member.user.email}
              </span>
            </>
          ) : (
            <UserIcon className="h-4 w-4 text-gray-400" />
          )}
        </button>
        {assigneeOpen && (
          <div className="absolute left-2 top-full mt-1 w-52 bg-white border border-gray-200 rounded shadow-lg z-30 py-1 max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                void onPatch({ assigneeId: null });
                setAssigneeOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
            >
              <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center">
                <UserIcon className="h-3 w-3 text-gray-500" />
              </span>
              Unassigned
            </button>
            {members
              .filter((m) => m.user)
              .map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    void onPatch({ assigneeId: m.userId });
                    setAssigneeOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                    m.userId === s.assigneeId ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{ background: avatarColor(m.userId) }}
                  >
                    {userInitials(m.user)}
                  </span>
                  <span className="truncate">{m.user!.firstName ?? m.user!.email}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 relative" ref={statusRef}>
        <button
          type="button"
          onClick={() => setStatusOpen((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${statusPillClass(cat)}`}
        >
          {s.status?.name ?? "TO DO"}
          <ChevronDown className="h-3 w-3" />
        </button>
        {statusOpen && (
          <div className="absolute left-2 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
            {statuses.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  void onPatch({ statusId: st.id });
                  setStatusOpen(false);
                }}
                className="w-full px-2.5 py-1.5 text-left hover:bg-gray-50"
              >
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${statusPillClass(st.category)}`}
                >
                  {st.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 text-right text-xs text-gray-400">—</div>
    </div>
  );
}
