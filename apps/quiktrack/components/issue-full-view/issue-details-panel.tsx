"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  ChevronDown as ChevronDownArrow,
  Equal,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import type { IssuePageData, Priority } from "./types";

interface Member {
  userId: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

const PRIORITY_META: Record<Priority, { label: string; color: string; Icon: React.ElementType }> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

function userName(u: Member["user"]) {
  if (!u) return "Unassigned";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
}
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
  if (category === "DONE") return "qt-issue-status-pill qt-issue-status-pill--done bg-green-100 text-green-700 hover:bg-green-200";
  if (category === "IN_PROGRESS") return "qt-issue-status-pill qt-issue-status-pill--progress bg-blue-100 text-blue-700 hover:bg-blue-200";
  return "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-100 text-gray-700 hover:bg-gray-200";
}

/**
 * Right-rail Details panel for the full-page issue view. Shows status pill,
 * "My pinned fields" + "Details" cards. Each editable row uses a thin
 * `PATCH /api/issues/[id]` round-trip via the parent's `onPatch` callback.
 */
export function IssueDetailsPanel({
  issue,
  onPatch,
}: {
  issue: IssuePageData;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string; category: string }[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    void fetch(`/api/projects/${issue.projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          const list = Array.isArray(j.data?.members) ? j.data.members : j.data ?? [];
          setMembers(list);
        }
      })
      .catch(() => undefined);
    void fetch(`/api/projects/${issue.projectId}/statuses`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setStatuses(j.data ?? []);
      })
      .catch(() => undefined);
  }, [issue.projectId]);

  const assignee = members.find((m) => m.userId === issue.assigneeId);
  const reporter = members.find((m) => m.userId === issue.reporterId);
  const P = PRIORITY_META[issue.priority];

  return (
    <aside className="space-y-3 text-sm">
      {/* Status pill + lightning automation slot — pill colour follows the
          status category (BACKLOG = gray, IN_PROGRESS = blue, DONE = green)
          so the button reads at-a-glance. Dropdown options use the same
          coloured-pill treatment. */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold uppercase tracking-wider rounded ${statusPillClass(
              issue.status?.category,
            )}`}
          >
            {issue.status?.name ?? "To Do"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div className="absolute left-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1.5">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    await onPatch({ statusId: s.id });
                    setStatusOpen(false);
                  }}
                  className={`w-full flex items-center px-2.5 py-1 text-left hover:bg-gray-50 ${
                    s.id === issue.statusId ? "bg-blue-50/60" : ""
                  }`}
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${statusPillClass(
                      s.category,
                    )}`}
                  >
                    {s.name}
                  </span>
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
                >
                  Create status
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
                >
                  Edit status
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
                >
                  View workflow
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          className="h-8 w-8 inline-flex items-center justify-center border border-gray-200 rounded hover:bg-gray-50"
          aria-label="Automation"
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" />
        </button>
      </div>

      {/* My pinned fields */}
      <Card title="My pinned fields">
        <Row label="Start date">
          <span className="text-gray-500">{issue.startDate ?? "None"}</span>
        </Row>
      </Card>

      {/* Details */}
      <Card title="Details" trailing={<SlidersHorizontal className="h-3.5 w-3.5 text-gray-500" />}>
        <Row label="Assignee">
          {assignee?.user ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: avatarColor(assignee.userId) }}
              >
                {userInitials(assignee.user)}
              </span>
              {userName(assignee.user)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-gray-500">
              <UserIcon className="h-4 w-4" />
              Unassigned
            </span>
          )}
        </Row>
        <Row label="Priority">
          <span className={`inline-flex items-center gap-1 ${P.color}`}>
            <P.Icon className="h-4 w-4" />
            {P.label}
          </span>
        </Row>
        {/* Parent row — only meaningful for SUBTASKs (which sit under a
            task). Epics and top-level work items hide this row. */}
        {issue.type === "SUBTASK" && (
          <Row label="Parent">
            {issue.parent ? (
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                <Zap className="h-3 w-3" />
                {issue.parent.key} {issue.parent.title}
              </span>
            ) : (
              <span className="text-gray-500">None</span>
            )}
          </Row>
        )}
        <Row label="Due date">
          <span className="text-gray-700">
            {issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "None"}
          </span>
        </Row>
        <Row label="Labels">
          <span className="text-gray-500">None</span>
        </Row>
        <Row label="Team">
          <span className="text-gray-500">None</span>
        </Row>
        {/* Sprint row hidden on epics (epics span sprints by definition). */}
        {issue.type !== "EPIC" && (
          <Row label="Sprint">
            <span className="text-blue-600">{issue.sprintId ? "Active sprint" : "None"}</span>
          </Row>
        )}
        <Row label="Original estimate">
          <span className="text-gray-700">{issue.eta ? `${issue.eta}h` : "0m"}</span>
        </Row>
        <Row label="Time remaining">
          <span className="text-gray-700">0m</span>
        </Row>
        <Row label="Story point estimate">
          <span className="text-gray-700">{issue.storyPoints ?? "None"}</span>
        </Row>
        <Row label="Reporter">
          {reporter?.user ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: avatarColor(reporter.userId) }}
              >
                {userInitials(reporter.user)}
              </span>
              {userName(reporter.user)}
            </span>
          ) : (
            <span className="text-gray-500">None</span>
          )}
        </Row>
      </Card>
    </aside>
  );
}

function Card({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-md">
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          open ? "border-b border-gray-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {title}
        </button>
        {trailing}
      </div>
      {open && <div className="px-4 py-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-2 text-xs">
      <div className="text-gray-500 pt-0.5">{label}</div>
      <div className="text-gray-800 min-w-0">{children}</div>
    </div>
  );
}
